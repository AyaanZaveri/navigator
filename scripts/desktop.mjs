import { spawn } from "node:child_process";
import { cp, mkdir, access, writeFile, chmod } from "node:fs/promises";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchNodeRuntime } from "./desktop-runtime.mjs";
import { packageWindows } from "./package-windows.mjs";
import { readFile } from "node:fs/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktop = join(root, "desktop");
const manifest = join(desktop, "Cargo.toml");
function run(program, args, env = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(program, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });
        child.on("error", reject);
        child.on("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${program} exited ${code ?? signal}`)));
    });
}
async function exists(path) { try { await access(path); return true; } catch { return false; } }
const command = process.argv[2];
const extra = process.argv.slice(3).filter((arg) => arg !== "--");

try {
    if (command === "dev") {
        // The user owns the Next development server. This starts the native shell only.
        await run("cargo", ["run", "--manifest-path", manifest, "--", "--url", process.env.NAVIGATOR_DESKTOP_URL || "http://localhost:3000", ...extra]);
    } else if (command === "check") {
        await run("cargo", ["fmt", "--manifest-path", manifest, "--all", "--", "--check"]);
        await run("cargo", ["test", "--manifest-path", manifest, "--locked"]);
    } else if (command === "package") {
        // Explicit packaging command, never run as a side effect of next dev/build.
        const nativeName = process.platform === "win32" ? "navigator-desktop.exe" : "navigator-desktop";
        const windows = process.platform === "win32" ? await import("./build-windows-native.mjs") : null;
        const native = windows ? windows.windowsNativeExecutable : join(desktop, "target", "release", nativeName);
        const standalone = join(root, ".next", "standalone");
        if (!extra.includes("--skip-build")) {
            await run(process.execPath, [join(root, "node_modules", "next", "dist", "bin", "next"), "build"], { NAVIGATOR_DESKTOP: "1" });
            if (windows) await windows.buildWindowsNative();
            else await run("cargo", ["build", "--manifest-path", manifest, "--release", "--locked"]);
        }
        if (!await exists(native) || !await exists(join(standalone, "server.js"))) throw new Error("Build the native shell and Next standalone output before packaging with --skip-build.");
        const output = join(root, "dist", `desktop-${process.platform}-${process.arch}`);
        const mac = process.platform === "darwin";
        const bundle = mac ? join(output, "Navigator.app", "Contents") : output;
        const bin = mac ? join(bundle, "MacOS") : output;
        const resources = join(bundle, mac ? "Resources" : "resources");
        if (await exists(output)) throw new Error(`Output already exists: ${output}. Move or remove it before packaging again.`);
        await mkdir(bin, { recursive: true });
        await mkdir(join(resources, "runtime"), { recursive: true });
        await cp(native, join(bin, nativeName));
        await cp(standalone, join(resources, "server"), {
            recursive: true, dereference: true,
            // Never distribute local credentials or cached runtime responses.
            filter: (source) => !basename(source).startsWith(".env")
                && source !== join(standalone, ".next", "cache"),
        });
        if (await exists(join(root, "public"))) await cp(join(root, "public"), join(resources, "server", "public"), { recursive: true });
        await cp(join(root, ".next", "static"), join(resources, "server", ".next", "static"), { recursive: true });
        await fetchNodeRuntime(join(resources, "runtime"));
        const os = mac ? "macos" : process.platform === "win32" ? "windows" : "linux";
        const arch = process.arch === "x64" ? "x86_64" : process.arch === "arm64" ? "aarch64" : process.arch;
        const vendor = process.env.NAVIGATOR_LIBS_DIR || join(desktop, "vendor", `${os}-${arch}`);
        if (await exists(vendor)) await cp(vendor, join(resources, "lib"), { recursive: true, dereference: true });
        else if (process.platform !== "linux") throw new Error(`A portable libmpv bundle is required at ${vendor}. Use npm run desktop:fetch-libs first.`);
        await cp(join(desktop, "licenses"), join(resources, "licenses"), { recursive: true });
        await cp(join(desktop, "THIRD-PARTY.md"), join(resources, "THIRD-PARTY.md"));
        if (mac) {
            await run("sh", [join(root, "scripts", "generate-macos-icon.sh")]);
            await cp(join(root, "build", "icon.icns"), join(resources, "Navigator.icns"));
            await writeFile(join(bundle, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>app.navigator.desktop</string>
<key>CFBundleName</key><string>Navigator</string>
<key>CFBundleExecutable</key><string>navigator-desktop</string>
<key>CFBundleIconFile</key><string>Navigator.icns</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>NSHighResolutionCapable</key><true/>
<key>LSMinimumSystemVersion</key><string>13.5</string>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/><key>NSAllowsArbitraryLoadsInWebContent</key><true/></dict>
</dict></plist>`);
            await chmod(join(bin, nativeName), 0o755);
            // Development bundle. Developer ID signing/notarization is a separate release step.
            await run("codesign", ["--force", "--deep", "--sign", "-", join(output, "Navigator.app")]);
        }
        if (process.platform === "win32") {
            const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
            const artifacts = await packageWindows(output, version);
            console.log(`Windows installer: ${artifacts.installer}\nPortable ZIP: ${artifacts.portable}`);
        }
        console.log(`Packaged desktop app: ${output}`);
    } else {
        throw new Error("Usage: node scripts/desktop.mjs dev|check|package [--skip-build]");
    }
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
}
