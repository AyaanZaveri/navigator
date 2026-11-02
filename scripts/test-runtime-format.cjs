const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/format-runtime.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, context);
for (const [input, expected] of [
    ['2h6min', '2h 6m'], ['2h 6m', '2h 6m'], ['126 min', '2h 6m'],
    [126, '2h 6m'], ['2 hours, 6 minutes', '2h 6m'], ['45 mins', '45m'],
    [120, '2h'], ['2h0min', '2h'], [' 96 min ', '1h 36m'],
    [undefined, undefined], [null, undefined], ['', undefined], [NaN, undefined],
    [-5, undefined], ['Unknown', 'Unknown'],
]) assert.equal(context.exports.formatRuntime(input), expected, String(input));
console.log('PASS: numeric minutes and provider runtime strings consistently use spaced hour/minute labels.');
