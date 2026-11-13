// Sign an immutable macOS ZIP with Navigator's dedicated login-Keychain key.
import { createPublicKey, verify } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fetchSparkle } from "./fetch-sparkle.mjs";
import { updateReleaseNotesHtml } from "./update-release-notes.mjs";
const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const KEYCHAIN_ACCOUNT = "app.navigator.desktop.sparkle";
const xml = value => String(value).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
export function makeMacOSFeed({ version, tag, filename, bytes, signature, publicKey }) {
    if (!/^\d+\.\d+\.\d+$/.test(version) || tag !== `release-v${version}` || filename !== `Navigator-${version}-macos-arm64.zip`) throw new Error("Invalid macOS release metadata");
    const raw = Buffer.from(publicKey.trim(), "base64");
    if (raw.length !== 32) throw new Error("Invalid macOS update public key");
    const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]), format: "der", type: "spki" });
    if (!verify(null, bytes, key, Buffer.from(signature, "base64"))) throw new Error("macOS update signature does not match the public key shipped in Navigator");
    return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Navigator for macOS</title>
    <language>en</language>
    <item>
      <title>Navigator ${xml(version)}</title>
      <description><![CDATA[${updateReleaseNotesHtml}]]></description>
      <sparkle:minimumSystemVersion>13.5</sparkle:minimumSystemVersion>
      <enclosure url="https://github.com/AyaanZaveri/navigator/releases/download/${xml(tag)}/${xml(filename)}"
        sparkle:version="${xml(version)}" sparkle:shortVersionString="${xml(version)}"
        sparkle:edSignature="${xml(signature)}" length="${bytes.length}" type="application/octet-stream" />
    </item>
  </channel>
</rss>
`;
}
export async function signMacOSArchive(archive, version, tag, output) {
    const publicKey = (await readFile(join(root, "desktop/macos/update-public-key.txt"), "utf8")).trim();
    const { stdout: plist } = await exec("/usr/bin/unzip", ["-p", resolve(archive), "Navigator.app/Contents/Info.plist"]);
    for (const [name, value] of [["CFBundleVersion", version], ["CFBundleIdentifier", "app.navigator.desktop"], ["SUPublicEDKey", publicKey]]) {
        // A release archive must contain the advertised version and trust key.
        if (!plist.includes(`<key>${name}</key><string>${value}</string>`)) throw new Error(`Archive ${name} does not match release metadata`);
    }
    const sdk = await fetchSparkle();
    const { stdout } = await exec(join(sdk, "bin/sign_update"), ["--account", KEYCHAIN_ACCOUNT, "-p", resolve(archive)]);
    const feed = makeMacOSFeed({ version, tag, filename: basename(archive), bytes: await readFile(archive), signature: stdout.trim(), publicKey });
    await writeFile(output, feed);
    return output;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [archive, version, tag, output] = process.argv.slice(2);
    if (!output) throw new Error("Usage: macos-update-feed.mjs <archive.zip> <version> <release-vX.Y.Z> <output.xml>");
    await signMacOSArchive(archive, version, tag, output);
    console.log(`Signed macOS appcast: ${output}`);
}
