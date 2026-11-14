// Used only by installation preparation. Normal app launch never runs this file.
const { createHash } = require('node:crypto');
const { createReadStream, appendFileSync } = require('node:fs');
const { readFile, lstat, realpath } = require('node:fs/promises');
const { resolve, join, relative, isAbsolute } = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const http = require('node:http');
const net = require('node:net');

async function verifyFiles(resources, manifestPath = join(resources, 'install-manifest.json')) {
  const root = await realpath(resources);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Invalid installation manifest');
  const seen = new Set();
  // Validate the whole manifest before starting bounded parallel file reads.
  for (const entry of manifest.files) {
    if (typeof entry.path !== 'string' || entry.path.includes('\\') || entry.path.includes(':') || entry.path.split('/').some(part => !part || part === '.' || part === '..')
      || seen.has(entry.path) || !Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid installation manifest entry');
    seen.add(entry.path);
  }
  let next = 0;
  async function worker() {
   while (next < manifest.files.length) {
    const entry = manifest.files[next++];
    const file = join(root, entry.path);
    const metadata = await lstat(file);
    const actual = await realpath(file);
    const inside = relative(root, actual);
    if (!metadata.isFile() || isAbsolute(inside) || inside === '..' || inside.startsWith('../') || inside.startsWith('..\\') || metadata.size !== entry.size) throw new Error(`Installed file is missing or invalid: ${entry.path}`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    if (hash.digest('hex') !== entry.sha256) throw new Error(`Installed file failed verification: ${entry.path}`);
   }
  }
  await Promise.all(Array.from({ length: Math.min(8, manifest.files.length) }, () => worker()));
  return manifest.files.length;
}

// A cold install can spend substantially longer loading files than an already
// running app. Keep this below the native preparation watchdog (180 seconds).
const SERVICE_READY_TIMEOUT_MS = 90_000;
async function checkLocalService(resources, timeoutMs = SERVICE_READY_TIMEOUT_MS) {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(join(resources, 'runtime/node.exe'), ['server.js'], {
    cwd: join(resources, 'server'), windowsHide: true, stdio: 'ignore',
    env: { ...process.env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port), NAVIGATOR_DESKTOP: '1' },
  });
  let spawnError;
  let lastStatus;
  let lastError;
  child.on('error', error => { spawnError = error; });
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Local service exited during installation preparation (exit ${child.exitCode})`);
      const ready = await new Promise(resolve => {
        const remaining = deadline - Date.now();
        let timer;
        const finish = value => { clearTimeout(timer); resolve(value); };
        const request = http.get({ hostname: '127.0.0.1', port, path: '/', timeout: 3000 }, response => {
          lastStatus = response.statusCode;
          let length = 0;
          response.on('data', chunk => { length += chunk.length; if (length > 8*1024*1024) response.destroy(); });
          response.on('end', () => finish(response.statusCode === 200 && length > 0));
          response.on('error', () => finish(false));
          response.on('close', () => finish(false));
        });
        // Socket idle timeouts alone do not bound a page that keeps streaming.
        timer = setTimeout(() => {
          lastError = 'HTTP response exceeded the request deadline';
          request.destroy();
          finish(false);
        }, Math.max(1, Math.min(10_000, remaining)));
        request.on('timeout', () => { lastError = 'HTTP socket timed out'; request.destroy(); });
        request.on('error', error => { lastError = error.code || error.message; finish(false); });
      });
      if (ready) return;
      await new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(100, deadline - Date.now()))));
    }
    throw new Error(`Local service did not become ready during installation preparation after ${timeoutMs}ms${lastStatus ? ` (last HTTP status ${lastStatus})` : ''}${lastError ? ` (${lastError})` : ''}`);
  } finally {
    if (child.exitCode === null && child.pid) {
      const closed = once(child, 'close');
      child.kill();
      await closed;
    }
  }
}

async function prepare(resources, manifestPath) {
  const started = Date.now();
  const files = await verifyFiles(resources, manifestPath);
  console.log(`Verified ${files} installed files in ${Date.now()-started}ms`);
  await checkLocalService(resources);
  console.log(`Local service check completed in ${Date.now()-started}ms`);
}
module.exports = { verifyFiles, checkLocalService, prepare, SERVICE_READY_TIMEOUT_MS };
if (require.main === module) prepare(resolve(process.argv[2] || __dirname), process.argv[3]).catch(error => {
  console.error(error.message);
  if (process.env.LOCALAPPDATA) {
    try { appendFileSync(join(process.env.LOCALAPPDATA, 'Navigator Desktop', 'installation.log'), `${error.message}\n`); } catch {}
  }
  process.exitCode = 1;
});
