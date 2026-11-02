const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}) {
    const context = { exports: {}, URL, require: name => dependencies[name] };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText, context);
    return context.exports;
}
const contrast = load('lib/logo-contrast.ts');
const { paintLogoBackdrop, logoSampleSource, verticalGradientStops } = load('lib/logo-backdrop.ts', { '@/lib/logo-contrast': contrast });
const css = 'linear-gradient(rgba(255, 255, 255, 0) 0%, rgb(255, 255, 255) 100%)';
assert.equal(verticalGradientStops(css).length, 2, 'Commas inside color functions must not split the gradient');
assert.equal(verticalGradientStops('linear-gradient(90deg, black, white)'), null);
assert.equal(verticalGradientStops('linear-gradient(to bottom, transparent, white 100%)')[0].position, 0);
assert.ok(logoSampleSource('/api/artwork?id=tt123&type=movie&kind=backdrop', 'https://navigator.test').includes('sample=1'));
assert.equal(logoSampleSource('https://image.tmdb.org/t/p/w1280/art.jpg', 'https://navigator.test'), 'https://image.tmdb.org/t/p/w1280/art.jpg');

// A one-pixel software canvas exercises the real painter's compositing at the
// logo center. The fixed logo stays at y=8 while artwork/fade scroll underneath.
function reading({ top = 0, background = 255, fade = false, imageOpacity = 1, tint = false } = {}) {
    let pixel = [0, 0, 0];
    function color(cssColor) {
        if (cssColor === 'transparent') return [0, 0, 0, 0];
        const values = cssColor.match(/[\d.]+/g).map(Number);
        return [values[0], values[1], values[2], values[3] ?? 1];
    }
    const point = { x: 8, y: 8 };
    function blend(value, opacity) {
        const alpha = value[3] * opacity;
        pixel = pixel.map((channel, i) => channel * (1 - alpha) + value[i] * alpha);
    }
    const context = {
        canvas: { width: 1, height: 1 }, globalAlpha: 1, fillStyle: '',
        clearRect() {}, save() {}, restore() {}, scale() {}, translate() {},
        createLinearGradient(_x, y, _x2, bottom) {
            return { y, bottom, stops: [], addColorStop(position, value) { this.stops.push({ position, color: color(value) }); } };
        },
        fillRect(x, y, width, height) {
            if (point.x < x || point.x >= x + width || point.y < y || point.y >= y + height) return;
            if (typeof this.fillStyle === 'string') blend(color(this.fillStyle), this.globalAlpha);
            else {
                const gradient = this.fillStyle;
                const fraction = Math.max(0, Math.min(1, (point.y - gradient.y) / (gradient.bottom - gradient.y)));
                const a = gradient.stops[0].color, b = gradient.stops.at(-1).color;
                blend(a.map((value, i) => value + (b[i] - value) * fraction), this.globalAlpha);
            }
        },
        drawImage(image, _sx, _sy, _sw, _sh, x, y, width, height) {
            if (point.x >= x && point.x < x + width && point.y >= y && point.y < y + height) blend(image.color, this.globalAlpha);
        },
    };
    const rect = { left: 0, top, width: 100, height: 100 };
    const overlays = fade ? [{ rect, background: css, opacity: 1 }] : [];
    if (tint) overlays.push({ rect: {left:0,top:0,width:100,height:100}, background: css, opacity: .12 });
    paintLogoBackdrop(context, {left:0,top:0,width:16,height:16}, `rgb(${background}, ${background}, ${background})`, {
        image: { naturalWidth: 100, naturalHeight: 100, color: [30,30,30,1] }, rect, opacity: imageOpacity, objectPosition: '50% 50%',
    }, overlays);
    return contrast.chooseLogoTreatment(new Uint8ClampedArray([...pixel,255]), {
        light: [54,204,176,255], dark: [17,135,119,255], deep: [7,84,73,255],
    });
}
assert.equal(reading(), 'light', 'Dark artwork selects the bright logo in light mode');
assert.equal(reading({ background: 0 }), 'light', 'The same opaque artwork selects the same logo in dark mode');
assert.equal(reading({ imageOpacity: .88 }), 'light', 'A subtle light-theme artwork wash does not force a theme-based logo');
assert.equal(reading({ fade: true }), 'light');
assert.equal(reading({ top: -70, fade: true }), 'deep', 'The fade to white must switch the logo before the backdrop leaves the screen');
assert.equal(reading({ top: -94 }), 'deep', 'Partially exposed page background must be sampled too');
assert.equal(reading({ top: -120 }), 'deep', 'Once artwork leaves, sample the actual white page');
assert.equal(reading({ top: -120, background: 0 }), 'light', 'A black page retains the brighter logo');
console.log('PASS: local compositing, theme-independent artwork contrast, scroll fades, partial overlap, page color, and origin-clean sample URLs');
