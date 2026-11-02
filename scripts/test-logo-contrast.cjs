const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/logo-contrast.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { minimumLogoContrast, chooseLogoTreatment, getLogoSampleCrop } = context.exports;

const solid = (value) => new Uint8ClampedArray([value, value, value, 255]);
const colors = { light: [54, 204, 176, 255], dark: [17, 135, 119, 255], deep: [7, 84, 73, 255] };
function paletteFor(background) {
    return Object.fromEntries(Object.entries(colors).map(([tone, color]) => {
        const pixels = new Uint8ClampedArray(background.length);
        for (let i = 0; i < pixels.length; i += 4) pixels.set(color, i);
        return [tone, pixels];
    }));
}
const treatment = (pixels, current) => chooseLogoTreatment(pixels, paletteFor(pixels), current);
assert.equal(treatment(solid(255)), 'deep', 'Bright artwork needs the high-contrast deep teal variant');
assert.equal(treatment(solid(0)), 'light', 'Dark artwork needs the light mint variant');
assert.equal(treatment(solid(128)), 'deep', 'Midtone surfaces choose the highest-contrast bare variant');
assert.equal(minimumLogoContrast([], []), 0);
assert.equal(minimumLogoContrast(solid(255), [0, 0, 0, 0]), 0, 'Transparent gaps must not influence contrast');
assert.equal(minimumLogoContrast(solid(255), solid(0)), 21);
const nearlyEqual = { light: solid(240), dark: solid(239), deep: solid(0) };
assert.equal(chooseLogoTreatment(solid(0), nearlyEqual, 'dark'), 'dark', 'Small score differences must not flicker');
assert.equal(chooseLogoTreatment(solid(255), nearlyEqual, 'dark'), 'deep', 'Hysteresis must never retain an unreadable bare mark');
for (let value = 0; value <= 255; value++) {
    assert.ok(['light', 'dark', 'deep'].includes(treatment(solid(value))), 'Every surface must select one of the three bare marks');
}

function approximately(actual, expected) {
    assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} should equal ${expected}`);
}

// A 2:1 backdrop in a square hero loses its left and right quarters to object-cover.
const box = { left: 100, top: 50, width: 500, height: 500 };
const logo = { left: 120, top: 70, width: 32, height: 32 };
const crop = getLogoSampleCrop(2000, 1000, box, logo);
approximately(crop.x, 540);
approximately(crop.y, 40);
approximately(crop.width, 64);
approximately(crop.height, 64);
assert.equal(getLogoSampleCrop(2000, 1000, box, { ...logo, left: 90 }), null);
assert.equal(getLogoSampleCrop(0, 1000, box, logo), null);
assert.equal(getLogoSampleCrop(2000, 1000, { ...box, width: 0 }, logo), null);
approximately(getLogoSampleCrop(2000, 1000, box, logo, '0% 0%').x, 40);
approximately(getLogoSampleCrop(2000, 1000, box, logo, '100% 50%').x, 1040);

// Resizing into a wide hero changes the vertical crop, not the source's identity.
const wide = getLogoSampleCrop(1000, 1000, { left: 0, top: -100, width: 1000, height: 500 }, { left: 20, top: -80, width: 32, height: 32 });
approximately(wide.x, 20);
approximately(wide.y, 270);

// A white patch only beneath the logo must win over the rest of a dark image.
const localCrop = getLogoSampleCrop(100, 100, { left: 0, top: 0, width: 100, height: 100 }, { left: 0, top: 0, width: 16, height: 16 });
const image = new Uint8ClampedArray(100 * 100 * 4);
for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 100; x++) {
        const index = (y * 100 + x) * 4;
        image.fill(x < 16 && y < 16 ? 255 : 0, index, index + 3);
        image[index + 3] = 255;
    }
}
const patch = [];
for (let y = localCrop.y; y < localCrop.y + localCrop.height; y++) {
    for (let x = localCrop.x; x < localCrop.x + localCrop.width; x++) {
        patch.push(...image.slice((y * 100 + x) * 4, (y * 100 + x) * 4 + 4));
    }
}
assert.equal(treatment(image), 'dark');
assert.equal(treatment(new Uint8ClampedArray(patch)), 'deep', 'The pixels immediately beneath the logo determine its treatment');

console.log('PASS: exactly three bare logo variants, stroke contrast, hysteresis, localized crops, object-position, and resize geometry');
