const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const postcss = require('postcss');
const baseline = process.argv[2];
const read = file => baseline ? execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8'}) : fs.readFileSync(file,'utf8');
const declarations = rule => Object.fromEntries(rule.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value]));
const rule = (file,selector) => postcss.parse(read(file)).nodes.find(node=>node.type==='rule' && node.selector===selector);
const nativeCss = postcss.parse(read('components/player-mobile.css'));
let takeover;
nativeCss.walkRules(node=>{if(node.selector?.split(',').map(s=>s.trim()).includes('[data-browser-glass]')) takeover=declarations(node)});
assert.ok(takeover);
const formsContainingBlock = style => (style.position && style.position !== 'static')
 || ['transform','filter','backdrop-filter','perspective'].some(name=>style[name] && style[name]!=='none')
 || /\b(paint|layout|strict|content)\b/.test(style.contain ?? '');
for (const [file,selector] of [
 ['components/arc/dropdown-menu/dropdown-menu.module.css','.menu'],
 ['components/arc/popover/popover.module.css','.content'],
]) {
 const surface = declarations(rule(file,selector));
 // At rest the entrance transform has ended. Sampled canvas glass then removes
 // backdrop-filter; opacity/isolation/overflow alone cannot contain abspos
 // children. This tests the CSS condition, allowing relative/fixed/contain etc.
 const sampled = {...surface,...takeover,transform:'none'};
 assert.ok(formsContainingBlock(sampled), `${file}: the viewport-sized glass canvas/pseudo-element must remain positioned and clipped by its own surface after takeover`);
}
const list = declarations(rule('components/player-subtitles.module.css','.list'));
assert.ok(list['max-height'],'The inner subtitle scroller must have a finite available-height bound');
assert.ok(rule('components/player-subtitles.module.css','.list [data-slot="scroll-area-viewport"]'),'The actual scroll viewport, not the clipped glass shell, must inherit that bound');
console.log('PASS: settled sampled-glass containing blocks and bounded inner subtitle viewport');
