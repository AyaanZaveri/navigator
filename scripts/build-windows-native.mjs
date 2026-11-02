import { spawn } from "node:child_process";
import { copyFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const windowsNativeExecutable = join(root, "desktop/target/x86_64-pc-windows-msvc/release/navigator-desktop.exe");

export async function buildWindowsNative(output) {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("The private Windows release targets Windows x64");
  // An explicit target keeps this flag off host proc-macro builds. Link the CRT
  // into our EXE so a clean Windows machine needs no Visual C++ Redistributable.
  await new Promise((resolve, reject) => {
    const child = spawn("cargo", ["build", "--manifest-path", join(root, "desktop/Cargo.toml"), "--target", "x86_64-pc-windows-msvc", "--release", "--locked"], {
      cwd: root, stdio: "inherit", env: { ...process.env, RUSTFLAGS: `${process.env.RUSTFLAGS || ""} -C target-feature=+crt-static` },
    });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Windows native build exited ${code}`)));
  });
  if (output) await copyFile(windowsNativeExecutable, resolve(output));
  return windowsNativeExecutable;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildWindowsNative(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1; });
}
