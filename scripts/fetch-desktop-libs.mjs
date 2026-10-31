import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, cp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const platform = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : null;
if (!platform) throw new Error("Linux uses the system libmpv.so.2 package; see desktop/README.md.");
const arch = process.arch === "x64" ? "x86_64" : process.arch === "arm64" ? "aarch64" : null;
if (!arch) throw new Error(`Unsupported architecture: ${process.arch}`);
const pin = JSON.parse(await readFile(join(root, "desktop", "libs.json"), "utf8"));
const asset = pin[platform][arch];
const destination = join(root, "desktop", "vendor", `${platform}-${arch}`);
const temp = await mkdtemp(join(tmpdir(), "navigator-libs-"));
try {
    const response = await fetch(`https://github.com/AIOStreams/libs/releases/download/${pin.release}/${asset.file}`);
    if (!response.ok) throw new Error(`Library download returned HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error("Downloaded libraries do not match the pinned SHA-256.");
    const zip = join(temp, "libs.zip");
    const unpack = join(temp, "unpack");
    await writeFile(zip, bytes);
    await mkdir(unpack);
    const program = process.platform === "darwin" ? "ditto" : "tar";
    const args = process.platform === "darwin" ? ["-x", "-k", zip, unpack] : ["-xf", zip, "-C", unpack];
    await new Promise((resolve, reject) => {
        const child = spawn(program, args, { stdio: "inherit" });
        child.on("error", reject);
        child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Archive extraction failed (${code})`)));
    });
    const files = await readdir(unpack);
    if (!files.includes(platform === "macos" ? "libmpv.2.dylib" : "libmpv-2.dll")) throw new Error("Library archive layout does not match the pinned distribution.");
    if (platform === "windows") {
        const version = pin.vulkan.version;
        const folder = `VulkanRT-${arch === "x86_64" ? "X64" : "ARM64"}-${version}-Components`;
        const response = await fetch(`https://sdk.lunarg.com/sdk/download/${version}/${arch === "x86_64" ? "windows" : "warm"}/${folder}.zip`, { signal: AbortSignal.timeout(120_000) });
        if (!response.ok) throw new Error(`Vulkan loader download returned HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (createHash("sha256").update(bytes).digest("hex") !== pin.vulkan[arch]) throw new Error("Vulkan loader checksum mismatch");
        const archive = join(temp, "vulkan.zip");
        await writeFile(archive, bytes);
        await new Promise((resolve, reject) => {
            const child = spawn("tar", ["-xf", archive, "-C", temp], { stdio: "inherit" });
            child.on("error", reject);
            child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Vulkan extraction failed (${code})`)));
        });
        await mkdir(join(unpack, "vulkan"));
        await cp(join(temp, folder, ...(arch === "x86_64" ? ["x64"] : []), "vulkan-1.dll"), join(unpack, "vulkan", "vulkan-1.dll"));
        await cp(join(temp, folder, "VulkanRT-License.txt"), join(unpack, "vulkan", "VulkanRT-License.txt"));
    }
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    await cp(unpack, destination, { recursive: true });
    console.log(`Verified libraries (${pin.release}) installed in ${destination}`);
} finally { await rm(temp, { recursive: true, force: true }); }
