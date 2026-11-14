const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { checkLocalService, SERVICE_READY_TIMEOUT_MS } = require('../desktop/windows/prepare.cjs');
(async () => {
  assert.equal(SERVICE_READY_TIMEOUT_MS, 90_000, 'Cold installation startup gets 90 seconds within the native 180-second preparation limit');
  const root = await fs.mkdtemp(join(tmpdir(), 'navigator-install-readiness-'));
  try {
    await fs.mkdir(join(root, 'runtime'));
    await fs.mkdir(join(root, 'server'));
    if (process.platform === 'win32') await fs.copyFile(process.execPath, join(root, 'runtime/node.exe'));
    else await fs.symlink(process.execPath, join(root, 'runtime/node.exe'));
    await fs.writeFile(join(root, 'server/server.js'), `
const fs = require('node:fs');
const http = require('node:http');
fs.writeFileSync('pid', String(process.pid));
const server = http.createServer((request, response) => {
  fs.appendFileSync('requests', request.url + '\\n');
  if (request.url === '/login') { response.writeHead(307, { location: '/?signIn=1' }); response.end('Redirecting'); return; }
  const status = fs.readFileSync('status', 'utf8');
  if (status === 'stream') {
    response.writeHead(200);
    const timer = setInterval(() => response.write('still rendering'), 25);
    response.on('close', () => clearInterval(timer));
    return;
  }
  response.writeHead(Number(status));
  response.end('<html>Navigator guest entry</html>');
});
const delay = fs.existsSync('startup-delay') ? Number(fs.readFileSync('startup-delay', 'utf8')) : 0;
setTimeout(() => server.listen(Number(process.env.PORT), process.env.HOSTNAME), delay);
`);
    await fs.writeFile(join(root, 'server/status'), '200');
    await checkLocalService(root, 2000);
    assert((await fs.readFile(join(root, 'server/requests'), 'utf8')).split('\n').includes('/'));
    let pid = Number(await fs.readFile(join(root, 'server/pid'), 'utf8'));
    assert.throws(() => process.kill(pid, 0), 'The owned probe server must exit after success');
    await fs.writeFile(join(root, 'server/startup-delay'), '400');
    await checkLocalService(root, 2000);
    await fs.rm(join(root, 'server/startup-delay'));
    await fs.writeFile(join(root, 'server/status'), '503');
    await assert.rejects(checkLocalService(root, 1500), /Local service did not become ready/);
    pid = Number(await fs.readFile(join(root, 'server/pid'), 'utf8'));
    assert.throws(() => process.kill(pid, 0), 'The owned probe server must exit after failure');
    await fs.writeFile(join(root, 'server/status'), 'stream');
    const started = Date.now();
    await assert.rejects(checkLocalService(root, 500), /Local service did not become ready/);
    assert.ok(Date.now() - started < 1500, 'A streaming response cannot extend the hard readiness deadline');
    pid = Number(await fs.readFile(join(root, 'server/pid'), 'utf8'));
    assert.throws(() => process.kill(pid, 0), 'The owned server exits after a streaming timeout');
    console.log('PASS: actual guest-entry readiness, legacy login redirect, unhealthy response and owned-child cleanup');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
