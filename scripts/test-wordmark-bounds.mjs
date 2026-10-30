import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../lib/wordmark-bounds.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { getWordmarkBounds } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
function artwork(left, top, width, height) {
  const pixels = new Uint8ClampedArray(100 * 60 * 4);
  for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) pixels[(y * 100 + x) * 4 + 3] = 255;
  return pixels;
}
const wide = getWordmarkBounds(artwork(10, 20, 80, 20), 100, 60);
assert.deepEqual(wide, { left: .09, top: 19 / 60, width: .82, height: 22 / 60 });
const tall = getWordmarkBounds(artwork(30, 5, 40, 50), 100, 60);
const fit = bounds => {
  const aspect = 100 * bounds.width / (60 * bounds.height);
  const width = Math.min(640, 112 * aspect);
  return { width, height: width / aspect };
};
assert.ok(fit(wide).width > fit(tall).width * 3, 'Flat artwork should grow wider within the same height cap');
assert.ok(fit(wide).height <= 112 && fit(tall).height <= 112, 'Tall artwork must remain height-limited');
assert.deepEqual(getWordmarkBounds(artwork(0, 0, 100, 60), 100, 60), { left: 0, top: 0, width: 1, height: 1 });
assert.equal(getWordmarkBounds(new Uint8ClampedArray(100 * 60 * 4), 100, 60), null);
assert.equal(getWordmarkBounds([], 0, 0), null);
const noise = artwork(10, 20, 80, 20); noise[3] = 16;
assert.deepEqual(getWordmarkBounds(noise, 100, 60), wide, 'Near-transparent noise must not expand the canvas bounds');
console.log('Wordmark sizing regression checks passed.');
