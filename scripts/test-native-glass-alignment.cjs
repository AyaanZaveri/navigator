const assert = require('node:assert/strict');
const fs = require('node:fs');
const postcss = require('postcss');
const css = postcss.parse(fs.readFileSync('components/player-mobile.css', 'utf8'));
let rule;
css.walkRules(node => { if (node.selector === '[data-native-glass][data-slot="media-player-seek-tooltip"]::before') rule = node; });
assert.ok(rule, 'Moving scrub glass must use the gesture CSS coordinates instead of a sampled DOM rectangle');
const value = name => rule.nodes.find(node => node.prop === name)?.value;
let border;
css.walkRules(node => { if (node.selector === '[data-slot="media-player-seek-tooltip"]') border=Number.parseFloat(node.nodes.find(prop => prop.prop==='border')?.value); });
assert.equal(border,0,'The floating seek preview has no outer border');
function evaluate(expression, variables, area, image) {
  const math = expression.replace(/var\((--[\w-]+)(?:,\s*[^)]+)?\)/g, (_, name) => {
    assert.ok(name in variables, name); return String(variables[name]);
  }).replace(/(-?[\d.]+)%/g, (_, percent) => String(Number(percent) / 100 * (area - image)))
    .replace(/(-?[\d.]+)px/g, '$1').replace(/calc/g, '');
  assert.match(math, /^[\d\s.+\-*/()]+$/);
  return Function(`return (${math})`)();
}
// A paused video needs no new sample: moving the panel alone must keep the
// existing image's screen origin at (0,0), including a changed panel height.
let frames = 0;
for (const [vw, vh] of [[1000,500], [412,915]]) for (const [width,height] of [[224,158], [280,210]]) {
  for (let step = 0; step < 120; step++) {
    const x = width/2 + (vw-width)*step/119, y = vh-36, offset = 8;
    const variables = { '--native-glass-half-width': vw/2, '--native-glass-height': vh,
      '--seek-tooltip-x': x, '--seek-tooltip-y': y, '--seek-tooltip-side-offset': offset };
    const pseudoLeft = x-width/2+border-12, pseudoTop = y-height-offset+border-12;
    const backgroundX = evaluate(value('background-position-x'), variables, width-2*border+24, vw);
    const backgroundY = evaluate(value('background-position-y'), variables, height-2*border+24, vh);
    assert.ok(Math.abs(pseudoLeft + backgroundX) < .00001, 'Video pixels remain horizontally aligned on every gesture frame');
    assert.ok(Math.abs(pseudoTop + backgroundY) < .00001, 'Video pixels remain vertically aligned after preview resize');
    frames++;
  }
}
const player = fs.readFileSync('components/ui/media-player.tsx', 'utf8');
assert.match(player, /"--seek-tooltip-side-offset":.*currentTooltipSideOffset/);
console.log(`PASS: ${frames} gesture positions track the same cached video image exactly, without another capture or layout measurement`);
