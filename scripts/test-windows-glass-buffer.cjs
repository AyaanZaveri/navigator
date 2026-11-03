const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const events = new Map(), lifecycle = new Map(), sent = [], released = [], received = [];
const document = { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {} };
const window = { ipc: { postMessage(text) { sent.push(JSON.parse(text)); } }, chrome: { webview: {
    addEventListener(name, fn) { events.set(name, fn); }, releaseBuffer(buffer) { released.push(buffer); }
} }, addEventListener(name, fn) { lifecycle.set(name, [...(lifecycle.get(name)||[]),fn]); } };
window.top = window;
const code = fs.readFileSync('desktop/src/bridge.js','utf8').replaceAll('__ORIGIN__',JSON.stringify('https://navigator.test')).replaceAll('__PLATFORM__',JSON.stringify('windows')).replaceAll('__PROTOCOL__','1');
vm.runInNewContext(code, { window, document, location: { origin: 'https://navigator.test' }, console: { error() {} },
    Uint8ClampedArray, ImageData: class { constructor(data,width,height) { this.data=data;this.width=width;this.height=height; } } });
const bridge=window.navigatorDesktop;
bridge.send({ type:'load',session:'active' });
bridge.subscribe(message=>{if(message.type==='glass-pixels'){
    assert.ok(!sent.some(item=>item.type==='glass-consumed'&&item.sequence===message.sequence),'The current frame cannot be acknowledged before the synchronous copy');
    received.push([...message.frame.data]);
}});
const frame={type:'navigator-glass-frame',slot:0,sequence:1,session:'active',width:1,height:1};
events.get('message')({data:frame});
assert.equal(received.length,0,'Message/shared-buffer event ordering is independent');
assert.equal(sent.filter(m=>m.type==='glass-consumed').length,0);
const buffer=new ArrayBuffer(640*360*4);new Uint8ClampedArray(buffer).set([11,22,33,255]);
events.get('sharedbufferreceived')({additionalData:{type:'navigator-glass-buffer',slot:0},getBuffer:()=>buffer});
assert.deepEqual(received[0],[11,22,33,255]);
assert.equal(sent.at(-1).sequence,1);
new Uint8ClampedArray(buffer).set([44,55,66,255]);
// A consumer owns its copied pixels after ack even when the native slot is reused.
assert.deepEqual(received[0],[11,22,33,255]);
events.get('message')({data:{...frame,sequence:2,session:'old'}});
assert.equal(received.length,1);assert.equal(sent.at(-1).sequence,2,'Stale sessions still release their slot');
events.get('message')({data:{...frame,sequence:3,width:99999}});
assert.equal(received.length,1);assert.equal(sent.at(-1).sequence,3,'Invalid dimensions cannot allocate an arbitrary image');
bridge.subscribe(()=>{throw Error('consumer failed');});
sent.length=0;
events.get('message')({data:{...frame,sequence:4}});
assert.equal(received.length,2);assert.equal(sent.at(-1).sequence,4,'Listener exceptions cannot strand read-only slots');
const count=sent.length;
events.get('message')({data:{...frame,slot:999,sequence:5}});
assert.equal(sent.length,count,'Invalid slots cannot enter the pending queue');
for(const fn of lifecycle.get('pagehide'))fn();assert.equal(released.length,1);assert.equal(released[0],buffer);
console.log('PASS: shared-buffer ordering, copy-before-ack, source isolation, bounded dimensions, exceptions and release');
