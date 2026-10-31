// Tiny local HEVC Main 10 fixtures; requires ffmpeg with libx265.
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
const output = resolve(process.argv[2] || 'build/hdr-fixtures');
await mkdir(output, { recursive: true });
for (const [name, primaries, transfer, matrix] of [
    ['pq', 'bt2020', 'smpte2084', 'bt2020nc'],
    ['hlg', 'bt2020', 'arib-std-b67', 'bt2020nc'],
    ['sdr', 'bt709', 'bt709', 'bt709'],
]) {
    await new Promise((done, reject) => {
        const process = spawn('ffmpeg', [
            '-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=5',
            '-t', '4', '-pix_fmt', 'yuv420p10le', '-c:v', 'libx265', '-preset', 'ultrafast',
            // Write the VUI explicitly; container flags alone can lose these tags.
            '-x265-params', `log-level=error:pools=1:colorprim=${primaries}:transfer=${transfer}:colormatrix=${matrix}`,
            join(output, `${name}.mkv`),
        ], { stdio: 'inherit' });
        process.on('error', reject);
        process.on('exit', code => code === 0 ? done() : reject(new Error(`ffmpeg exited ${code}`)));
    });
}
console.log(`HDR fixtures: ${output}`);
