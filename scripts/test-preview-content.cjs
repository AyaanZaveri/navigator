const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/media/preview-content.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { previewContentBounds } = context.exports;
function frame(width, height, bars = {}) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const inside = y >= (bars.top || 0) && y < height - (bars.bottom || 0)
            && x >= (bars.left || 0) && x < width - (bars.right || 0);
        const i = (y * width + x) * 4;
        data[i] = inside ? 90 : 4; data[i + 1] = inside ? 120 : 4; data[i + 2] = inside ? 150 : 4; data[i + 3] = 255;
    }
    return data;
}
const crop = (width, height, bars) => previewContentBounds(frame(width, height, bars), width, height);
assert.equal(JSON.stringify(crop(224, 126)), JSON.stringify({x:0,y:0,width:224,height:126}));
const wide = crop(224, 126, {top:16,bottom:16});
assert.equal(wide.height, 94, 'Encoded letterbox bands are removed');
assert.equal(wide.width, 224, 'The thumbnail keeps its width');
const imax = crop(224, 157);
assert.ok(imax.height > wide.height, 'IMAX content is taller than a widescreen preview');
assert.equal(crop(224,126,{left:20,right:20}).width, 184, 'Pillarbox bands are removed too');
const black = previewContentBounds(new Uint8ClampedArray(224*126*4),224,126);
assert.equal(black.height,126,'Fully black frames must retain their original geometry');
assert.equal(black.width,224);
assert.equal(crop(224,126,{top:30}).height,126,'A dark area on one edge is not a matching letterbox');
console.log('PASS: intrinsic aspect ratios, letterbox/pillarbox trimming, IMAX height, dark-frame and asymmetric-edge preservation');
