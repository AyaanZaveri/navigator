import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const assets = path.join(root, 'app/src/main/assets');
const html = await readFile(path.join(assets, 'web/index.html'), 'utf8');
let checked = 0;
for (const match of html.matchAll(/(?:src|href)="(\/assets\/web\/[^"?]+)(?:[^"]*)"/g)) {
    await access(path.join(assets, match[1].slice('/assets/'.length)));
    checked++;
}
assert.ok(checked >= 3, 'Export must reference bundled scripts/styles/logo');
assert.ok(!/<video[\s>]/i.test(html), 'Native SurfaceView owns playback');
for (const [name, transfer, codec, pixels] of [
    ['sdr', 'bt709', 'h264', 'yuv420p'],
    ['pq', 'smpte2084', 'hevc', 'yuv420p10le'],
    ['hlg', 'arib-std-b67', 'hevc', 'yuv420p10le'],
]) {
    const result = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path.join(assets, `media/${name}.mp4`)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const probe = JSON.parse(result.stdout);
    const video = probe.streams.find(stream => stream.codec_type === 'video');
    assert.equal(video.color_transfer, transfer);
    assert.equal(video.codec_name, codec);
    assert.equal(video.pix_fmt, pixels);
    assert.equal(video.color_primaries, name === 'sdr' ? 'bt709' : 'bt2020');
    assert.ok(probe.streams.some(stream => stream.codec_name === 'aac'));
    assert.ok(Number(probe.format.duration) >= 11.9);
    console.log(`PASS: ${name} video, color tags, bit depth, audio, and duration`);
}
console.log(`PASS: ${checked} exported Next.js assets resolve inside the APK assets`);
