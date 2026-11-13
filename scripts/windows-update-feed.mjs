// Generate a signed feed only after the immutable installer has been built.
// Usage: node scripts/windows-update-feed.mjs <installer> <version> <release-tag> <private-key.pem> <output.xml>
import { createPublicKey, sign, verify } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { updateReleaseNotesHtml } from "./update-release-notes.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const xml = value => String(value).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
export function makeWindowsFeed({ version, tag, filename, bytes, privateKey, publicKey }) {
    if (!/^\d+\.\d+\.\d+$/.test(version) || !tag || /[\r\n]/.test(tag) || basename(filename) !== filename || !filename.endsWith('-windows-x64-setup.exe')) throw new Error("Invalid Windows release metadata");
    const key = createPublicKey(privateKey);
    if (key.asymmetricKeyType !== "ed25519" || key.export({ type: "spki", format: "der" }).subarray(-32).toString("base64") !== publicKey.trim()) throw new Error("Signing key does not match the public key shipped in Navigator");
    const signature = sign(null, bytes, privateKey);
    if (!verify(null, bytes, key, signature)) throw new Error("Update signature verification failed");
    const url = `https://github.com/AyaanZaveri/navigator/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(filename)}`;
    return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Navigator for Windows</title>
    <language>en</language>
    <item>
      <title>Navigator ${xml(version)}</title>
      <description><![CDATA[${updateReleaseNotesHtml}]]></description>
      <enclosure url="${xml(url)}" sparkle:version="${xml(version)}" sparkle:shortVersionString="${xml(version)}"
        sparkle:os="windows" sparkle:installerArguments="/S /UPDATE" sparkle:edSignature="${signature.toString('base64')}"
        length="${bytes.length}" type="application/octet-stream" />
    </item>
  </channel>
</rss>
`;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [installer, version, tag, key, output] = process.argv.slice(2);
    if (!output) throw new Error("Usage: windows-update-feed.mjs <installer> <version> <release-tag> <private-key.pem> <output.xml>");
    const feed = makeWindowsFeed({ version, tag, filename: basename(installer), bytes: await readFile(installer), privateKey: await readFile(key), publicKey: await readFile(joinRoot("desktop/windows/update-public-key.txt"), "utf8") });
    await writeFile(output, feed);
    console.log(`Signed update feed: ${output}`);
}
function joinRoot(path) { return resolve(root, path); }
