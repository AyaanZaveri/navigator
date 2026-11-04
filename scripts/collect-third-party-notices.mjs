import { readdir, readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { join, basename } from 'node:path';

/** Collect notices from installed packages, including nested dependencies and scoped packages. */
export async function collectThirdPartyNotices(modules, destination) {
    const seen = new Set(), packages = [];
    async function visit(path) {
        let canonical;
        try { canonical = await realpath(path); } catch { return; }
        if (seen.has(canonical)) return;
        seen.add(canonical);
        let files;
        try { files = await readdir(path, { withFileTypes: true }); } catch { return; }
        let metadata;
        try { metadata = JSON.parse(await readFile(join(path, 'package.json'), 'utf8')); } catch { /* module container */ }
        if (metadata?.name && metadata?.version) {
            const notices = [];
            for (const file of files) {
                if (file.isFile() && /^(licen[cs]e|notice|copying|copyright)([._-].*)?$/i.test(file.name)) {
                    notices.push({ file: file.name, text: await readFile(join(path, file.name), 'utf8') });
                }
            }
            packages.push({ name: metadata.name, version: metadata.version, license: metadata.license || 'See upstream', notices });
        }
        for (const file of files) {
            if (file.name === 'node_modules' || (!metadata && !file.name.startsWith('.'))) {
                if (file.isDirectory() || file.isSymbolicLink()) await visit(join(path, file.name));
            }
        }
    }
    await visit(modules);
    packages.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
    if (!packages.length) throw new Error(`No dependency metadata found in ${basename(modules)}`);
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, 'THIRD-PARTY-NPM.txt'), packages.map(pkg => [
        `${pkg.name}@${pkg.version}`, `License: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license)}`,
        ...pkg.notices.map(notice => `\n--- ${notice.file} ---\n${notice.text}`),
    ].join('\n')).join('\n\n========================================\n\n'));
    await writeFile(join(destination, 'npm-license-index.json'), JSON.stringify(packages.map(({ notices, ...metadata }) => ({
        ...metadata, notices: notices.map(notice => notice.file),
    })), null, 2) + '\n');
    return packages.length;
}
