const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const sharp = require('sharp');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/logo-contrast.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { HEADER_LOGO_SOURCES, chooseLogoTreatment, minimumLogoContrast } = context.exports;
async function run() {
    const logos = Object.fromEntries(await Promise.all(Object.entries(HEADER_LOGO_SOURCES).map(async ([tone, source]) => [
        tone, await sharp('public' + source.split('?')[0]).resize(64, 64).ensureAlpha().raw().toBuffer(),
    ])));
    const bright = await sharp('scripts/fixtures/header-logo-bright.png').ensureAlpha().raw().toBuffer();
    const deep = chooseLogoTreatment(bright, logos);
    assert.equal(deep, 'deep', 'The original snowy backdrop must select the approved third SVG');
    assert.ok(minimumLogoContrast(bright, logos.deep) >= 3, 'The actual deep-teal strokes must clear the design target on the regression image');
    function background(color) {
        const buffer = Buffer.alloc(bright.length);
        for (let i = 0; i < buffer.length; i += 4) buffer.set([...color, 255], i);
        return buffer;
    }
    assert.equal(chooseLogoTreatment(background([30, 30, 30]), logos), 'light');
    assert.equal(chooseLogoTreatment(background([125, 133, 130]), logos), 'deep');
    const split = background([16, 29, 26]);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) split.set([226, 238, 233, 255], (y * 64 + x) * 4);
    assert.equal(chooseLogoTreatment(split, logos), 'dark', 'Mixed backgrounds still select the most readable of the three bare marks');
    console.log('PASS: three real SVG variants over the supplied backdrop, dark, midtone and split surfaces.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
