import { spawnSync } from 'node:child_process';
import { mkdir, cp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const web = path.join(root, 'web');
const require = createRequire(path.join(web, 'package.json'));
await mkdir(path.join(web, 'public'), { recursive: true });
await cp(path.join(root, 'app/src/main/res/drawable/ic_navigator.png'), path.join(web, 'public/navigator.png'));
const result = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build', '--webpack'], {
    cwd: web, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
});
if (result.status !== 0) process.exit(result.status || 1);
const target = path.join(root, 'app/src/main/assets/web');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(path.join(web, 'out'), target, { recursive: true });
console.log('Copied static Next.js export into Android assets.');
