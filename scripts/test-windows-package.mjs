import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { windowsPowerShellEnvironment, createWindowsZip } from "./package-windows.mjs";
const environment = { PSModulePath: "PowerShell 7 modules", Path: "Windows", NAVIGATOR_BOOTSTRAPPER: "test with spaces/setup.exe" };
const child = windowsPowerShellEnvironment(environment);
assert.equal(child.PSModulePath, undefined, "Windows PowerShell must not inherit incompatible PowerShell 7 modules");
assert.equal(child.Path, environment.Path);
assert.equal(child.NAVIGATOR_BOOTSTRAPPER, environment.NAVIGATOR_BOOTSTRAPPER);
assert.equal(environment.PSModulePath, "PowerShell 7 modules", "The caller's environment remains unchanged");
assert.equal(windowsPowerShellEnvironment({ PSMODULEPATH: "wrong modules" }).PSMODULEPATH, undefined);

if (process.platform === "win32") {
  const temp = await mkdtemp(path.join(tmpdir(), "navigator zip test "));
  try {
    const payload = path.join(temp, "payload with spaces");
    const staticDir = path.join(payload, "resources", "server", ".next", "static");
    await mkdir(staticDir, { recursive: true });
    await writeFile(path.join(staticDir, "fixture.js"), "fixture");
    await writeFile(path.join(payload, "resources", "server", "server.js"), "fixture");
    execFileSync("attrib.exe", ["+h", path.dirname(staticDir)]);
    const archive = path.join(temp, "portable.zip");
    await createWindowsZip(payload, archive);
    // Inspect raw ZIP central-directory names independently of .NET, whose
    // reader may hide path-normalization differences from the writer.
    const zip = await readFile(archive);
    const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    assert.ok(end >= 0);
    let offset = zip.readUInt32LE(end + 16);
    const names = [];
    for (let i = 0; i < zip.readUInt16LE(end + 10); i++) {
      assert.equal(zip.readUInt32LE(offset), 0x02014b50);
      const length = zip.readUInt16LE(offset + 28);
      names.push(zip.toString("utf8", offset + 46, offset + 46 + length));
      offset += 46 + length + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
    }
    assert.ok(names.includes("resources/server/.next/static/fixture.js"), "Hidden Next assets must use portable forward-slash ZIP names");
    assert.ok(names.includes("resources/server/server.js"));
    assert.ok(names.every(name => !name.includes("\\")));
    console.log("Windows ZIP preserves hidden Next assets and standard archive paths.");
  } finally { await rm(temp, { recursive: true, force: true }); }
}

console.log("Windows packaging environment checks passed.");
