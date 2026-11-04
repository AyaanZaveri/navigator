// Self-generated signal fixtures; no third-party video or network dependencies.
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const output = fileURLToPath(new URL('../app/src/main/assets/media/', import.meta.url));
await mkdir(output, { recursive: true });
for (const [name, transfer] of [['sdr', 'bt709'], ['pq', 'smpte2084'], ['hlg', 'arib-std-b67']]) {
    const hdr = name !== 'sdr';
    const args = ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=480x270:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '12'];
    // Synthetic code-value patterns interpreted as PQ/HLG, not an SDR film conversion.
    if (hdr) args.push('-pix_fmt', 'yuv420p10le', '-c:v', 'libx265', '-preset', 'fast', '-crf', '30', '-tag:v', 'hvc1', '-x265-params', `log-level=error:pools=1:colorprim=bt2020:transfer=${transfer}:colormatrix=bt2020nc${name === 'pq' ? ':hdr10=1:master-display=G(8500,39850)B(6550,2300)R(35400,14600)WP(15635,16450)L(10000000,1):max-cll=1000,400' : ''}`);
    else args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '28', '-pix_fmt', 'yuv420p', '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709');
    args.push('-af', 'volume=0.06', '-c:a', 'aac', '-b:a', '48k', '-movflags', '+faststart', `${output}${name}.mp4`);
    const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
}
