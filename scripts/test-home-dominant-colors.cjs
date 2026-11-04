const assert = require('node:assert/strict');
const { load } = require('./test-support/react-hooks.cjs');
const aurora = load('lib/aurora-palette.ts');
const { selectHomeColors } = load('lib/home-palette-colors.ts', { './aurora-palette': aurora });
const { rgbToLab, homeWash } = load('lib/gradient-palette.ts', {}, { Float32Array });
function hue(hex) {
    const [r, g, b] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const high = Math.max(r, g, b), low = Math.min(r, g, b), c = high - low;
    if (c === 0) return null;
    return (((high === r ? (g - b) / c : high === g ? (b - r) / c + 2 : (r - g) / c + 4) * 60) + 360) % 360;
}
const blue = value => assert.ok(hue(value) >= 175 && hue(value) <= 245, `Expected dominant blue, got ${value}`);
const yellow = value => assert.ok(hue(value) >= 40 && hue(value) <= 70, `Expected yellow accent, got ${value}`);
// The blue backdrop spans several brightness levels; yellow is the largest
// individual swatch and the most vibrant one, but covers less total artwork.
const swatches = [
    { hex: '#215a80', population: 240 }, { hex: '#246d99', population: 220 },
    { hex: '#3489a8', population: 200 }, { hex: '#ffe000', population: 340 },
];
const selected = selectHomeColors(swatches);
blue(selected[0]); yellow(selected[2]);
assert.deepEqual(Array.from(selectHomeColors([...swatches].reverse())), Array.from(selected), 'Input order cannot change the dominant family');
blue(selectHomeColors([{ hex: '#526f86', population: 800 }, { hex: '#ffe000', population: 200 }])[0]);
blue(selectHomeColors([...swatches, { hex: '#000000', population: 1000 }, { hex: '#ffffff', population: 1000 }])[0]);
const tiny = selectHomeColors([{ hex: '#448844', population: 995 }, { hex: '#ff0000', population: 5 }]);
assert.equal(tiny[2], tiny[0], 'A tiny logo or stray pixel must not become a large accent');
const neutral = selectHomeColors([{ hex: '#888888', population: 990 }, { hex: '#ff0000', population: 10 }]);
assert.equal(hue(neutral[0]), null, 'Mostly neutral artwork retains a neutral base');
for (const hex of ['#000000', '#ffffff', '#777777']) {
    const palette = selectHomeColors([{ hex, population: 1000 }]);
    assert.equal(palette.length, 3); assert.ok(palette.every(value => hue(value) === null), 'Monochrome artwork must not invent colors');
}
assert.deepEqual(Array.from(selectHomeColors([{ hex: '#246d99', population: 900 }, { hex: '#ffff00', population: 0 }])),
    Array.from(selectHomeColors([{ hex: '#246d99', population: 900 }])), 'Synthesized zero-population swatches cannot win');
assert.equal(selectHomeColors([{ hex: 'invalid', population: 100 }, { hex: '#ff0000', population: NaN }, { hex: '#ffff00', population: -1 }]), null);
const wrap = selectHomeColors([{ hex: '#cc2244', population: 350 }, { hex: '#cc4422', population: 350 }, { hex: '#2244cc', population: 400 }]);
assert.ok(hue(wrap[0]) < 20 || hue(wrap[0]) > 340, 'Hue clustering must wrap smoothly through red');

const ramp = accent => new Float32Array([rgbToLab([.1, .4, .7]), rgbToLab([.8, .9, 1]), rgbToLab([.5, .6, .8]), rgbToLab(accent)].flat());
for (const light of [true, false]) {
    const wash = homeWash(ramp([1, .8, 0]), light, new Float32Array(6));
    assert.deepEqual(Array.from(homeWash(ramp([1, 0, .8]), light, new Float32Array(6))), Array.from(wash),
        'Vibrant accents affect dots, not the dominant background wash');
    assert.ok(wash[2] > wash[0] && wash[5] > wash[3], 'Both sides of the wash retain the dominant blue hue');
}

// Exercise the actual worker and MMCQ implementation, including white padding
// and fully transparent pixels, rather than relying only on invented swatches.
async function worker() {
    const results = [], self = { postMessage: message => results.push(message) };
    load('lib/palette.worker.ts', { './home-palette-colors': { selectHomeColors } }, { self });
    const pixels = new Uint8ClampedArray(1000 * 4);
    const regions = [
        [240, [33, 90, 128, 255]], [220, [36, 109, 153, 255]], [200, [52, 137, 168, 255]],
        [240, [255, 224, 0, 255]], [50, [255, 255, 255, 255]], [50, [255, 0, 255, 0]],
    ];
    let offset = 0;
    for (const [count, color] of regions) for (let i = 0; i < count; i++, offset += 4) pixels.set(color, offset);
    await self.onmessage({ data: { id: 1, pixels } });
    blue(results[0].colors[0]); yellow(results[0].colors[2]);
    assert.ok(!results[0].colors.some(value => hue(value) >= 280 && hue(value) <= 320), 'Invisible pixels cannot tint the background');
    await self.onmessage({ data: { id: 2, pixels: new Uint8ClampedArray([255, 255, 255, 255]) } });
    assert.ok(results[1].colors.every(value => hue(value) === null), 'White-only images remain valid neutral palettes');
}
worker().then(() => console.log('PASS: dominant population, grouped backdrop shades, yellow accents, neutral/letterbox handling, tiny/synthesized accents, hue wrap, wash isolation and real MMCQ worker pixels.'))
    .catch(error => { console.error(error); process.exitCode = 1; });
