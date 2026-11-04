const assert = require('node:assert/strict');
const { mkdtemp, mkdir, writeFile, readFile, rm, symlink } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { verifyFiles } = require('../desktop/windows/prepare.cjs');

(async () => {
  const { writeInstallManifest } = await import('./windows-install-manifest.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'navigator-install-test-'));
  try {
    const root = join(directory, 'resources');
    for (const [path, value] of [
      ['runtime/node.exe', 'runtime'], ['lib/libmpv-2.dll', 'video'],
      ['server/.next/static/chunks/ui.js', 'interface'], ['server/.next/server/page.js', 'page'],
      ['server/node_modules/unused.js', 'unused tooling'], ['server/public/poster.jpg', 'artwork'],
      ['server/.next/static/chunks/ui.js.map', 'source map'], ['prepare.cjs', 'preparation'],
    ]) {
      const file = join(root, path);
      await mkdir(require('node:path').dirname(file), { recursive: true });
      await writeFile(file, value);
    }
    await writeInstallManifest(root);
    const manifestFile = join(root, 'install-manifest.json');
    const original = JSON.parse(await readFile(manifestFile, 'utf8'));
    assert.equal(original.files.length, 5);
    assert.equal(await verifyFiles(root), 5);
    // Same-size corruption must be caught by the content digest.
    await writeFile(join(root, 'runtime/node.exe'), 'changed');
    await assert.rejects(verifyFiles(root), /failed verification/);
    await writeFile(join(root, 'runtime/node.exe'), 'runtime');
    for (const path of ['../outside', '/absolute', 'runtime/../outside', 'runtime\\node.exe']) {
      await writeFile(manifestFile, JSON.stringify({ version: 1, files: [{ ...original.files[0], path }] }));
      await assert.rejects(verifyFiles(root), /Invalid installation manifest entry/);
    }
    await writeFile(manifestFile, JSON.stringify({ version: 1, files: [original.files[0], original.files[0]] }));
    await assert.rejects(verifyFiles(root), /Invalid installation manifest entry/);
    await writeFile(manifestFile, JSON.stringify(original));
    // A symlink inside a nested resource directory cannot escape verification.
    if (process.platform !== 'win32') {
      await mkdir(join(directory, 'outside'));
      await writeFile(join(directory, 'outside/node.exe'), 'runtime');
      await rm(join(root, 'runtime'), { recursive: true });
      await symlink(join(directory, 'outside'), join(root, 'runtime'));
      await assert.rejects(verifyFiles(root), /missing or invalid/);
    }
    console.log('Windows startup manifest verification, corruption and path confinement passed.');
  } finally { await rm(directory, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
