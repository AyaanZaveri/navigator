import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile, cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

// Use official self-contained binaries rather than copying a Homebrew-linked Node.
export const NODE_VERSION = "26.7.0";
const CHECKSUMS = {
    "darwin-arm64": "7ee659a7768e641bbfd5360940660b8e8fd0052f77488f365562bac522fc15d4",
    "darwin-x64": "f279d1ed28ce57f7788bf23435d2ad7fdd7438904ad5c4d8a1081a7cde3d4b96",
    "linux-arm64": "925aa6157dd37542d0d7f2e28b7bf61e7b39284411210b0498bc3788db4aef68",
    "linux-x64": "bd6b6c31e377bad9ad579bed72e5bc11f4c879ac9452ad51d30e646ea3d828df",
    "win-arm64": "be8775204cfceca5a73c30f91bf0de5e85274c01b776dc13f16b91aa251ebb01",
    "win-x64": "d3bd72755141ed32bbcd841228ee81897c8a98d50dfa7dae2179399a0a7c90f8",
};
export async function fetchNodeRuntime(destination) {
    const platform = process.platform;
    if (!["darwin", "win32", "linux"].includes(platform) || !["x64", "arm64"].includes(process.arch)) throw new Error("Unsupported Node runtime target");
    const target = platform === "win32" ? "win" : platform;
    const stem = `node-v${NODE_VERSION}-${target}-${process.arch}`;
    const file = `${stem}.${platform === "win32" ? "zip" : "tar.gz"}`;
    const base = `https://nodejs.org/dist/v${NODE_VERSION}`;
    const download = async (name) => {
        const response = await fetch(`${base}/${name}`, { signal: AbortSignal.timeout(120_000) });
        if (!response.ok) throw new Error(`Node runtime download returned HTTP ${response.status}`);
        return Buffer.from(await response.arrayBuffer());
    };
    const sums = (await download("SHASUMS256.txt")).toString("utf8");
    const expected = sums.split("\n").find((line) => line.trim().endsWith(` ${file}`))?.trim().split(/\s+/)[0];
    if (!expected || expected !== CHECKSUMS[`${target}-${process.arch}`]) throw new Error("Official Node checksum does not match the pinned release");
    const bytes = await download(file);
    if (createHash("sha256").update(bytes).digest("hex") !== expected) throw new Error("Node runtime checksum mismatch");
    const temp = await mkdtemp(join(tmpdir(), "navigator-node-"));
    try {
        await writeFile(join(temp, file), bytes);
        const args = platform === "win32" ? ["-xf", join(temp, file), "-C", temp] : ["-xzf", join(temp, file), "-C", temp];
        await new Promise((resolve, reject) => {
            const child = spawn("tar", args, { stdio: "inherit" });
            child.on("error", reject);
            child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Node runtime extraction failed (${code})`)));
        });
        await mkdir(destination, { recursive: true });
        await cp(join(temp, stem, platform === "win32" ? "node.exe" : "bin/node"), join(destination, platform === "win32" ? "node.exe" : "node"));
        await cp(join(temp, stem, "LICENSE"), join(destination, "LICENSE"));
        await writeFile(join(destination, "VERSION"), `Node.js ${NODE_VERSION}\n${file}\nSHA-256 ${expected}\n`);
    } finally { await rm(temp, { recursive: true, force: true }); }
}
