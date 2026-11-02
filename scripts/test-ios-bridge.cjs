const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const raw=fs.readFileSync('ios/Navigator/Resources/bridge.js','utf8').replace('__NAVIGATOR_ORIGIN__',JSON.stringify('https://navigator.test')).replace('__NAVIGATOR_STYLES__',JSON.stringify('body{}'));
function setup({frame=false,origin='https://navigator.test'}={}){
 const sent=[],observers=[];let visible=false,dark=false;
 const document=new EventTarget();document.documentElement={dataset:{},classList:{contains:()=>dark},hasAttribute:()=>visible,setAttribute(){},removeAttribute(){}};document.head={appendChild(){}};document.createElement=()=>({});document.querySelector=()=>null;
 const window={webkit:{messageHandlers:{navigator:{postMessage:m=>sent.push(m)}}},addEventListener(){}};window.top=frame?{}:window;
 vm.runInNewContext(raw,{window,document,location:{origin},Event,MutationObserver:class{constructor(fn){observers.push(fn)}observe(){}disconnect(){}}});
 return{window,sent,visible(v){visible=v;observers.forEach(fn=>fn())},theme(v){dark=v;observers.forEach(fn=>fn())}};
}
const app=setup(),bridge=app.window.navigatorDesktop;
assert.equal(bridge.platform,'ios');assert.equal(bridge.engine,'vlc');assert.equal(bridge.capabilities.nativePreviews,true);assert.equal(bridge.capabilities.pip,false);
let received;const remove=bridge.subscribe(m=>received=m);
app.window.NavigatorIOS.receive({type:'state',session:'one',state:{position:4}});assert.equal(received.state.position,4);remove();
assert.equal(app.sent.find(m=>m.type==='appearance').theme,'light');
app.theme(true);assert.deepEqual(JSON.parse(JSON.stringify(app.sent.at(-1))),{type:'appearance',theme:'dark'});
const themed=app.sent.length;app.theme(true);assert.equal(app.sent.length,themed);
app.visible(true);assert.deepEqual(JSON.parse(JSON.stringify(app.sent.at(-1))),{type:'visible',value:true});
const before=app.sent.length;app.visible(true);assert.equal(app.sent.length,before);
assert.equal(setup({frame:true}).window.navigatorDesktop,undefined);assert.equal(setup({origin:'https://attacker.test'}).window.navigatorDesktop,undefined);
const native=fs.readFileSync('ios/Navigator/NavigatorViewController.swift','utf8');
assert.match(native,/message\.frameInfo\.isMainFrame/);assert.match(native,/securityOrigin/);assert.match(native,/websiteDataStore = \.default/);
assert.ok(!fs.readFileSync('ios/Navigator/Resources/Info.plist','utf8').includes('UIRequiresFullScreen'));
console.log('PASS: iOS bridge origin/frame isolation, sessions, capabilities, visibility, persistent cookies, adaptive scene configuration');
// Exercise the geometry producer and acknowledgement, not only source markers.
{
 const sent=[],frames=[];let menuOpen=false;
 const attrs=new Set(['data-native-playing']);
 const root={dataset:{},classList:{contains:()=>true},hasAttribute:k=>attrs.has(k),setAttribute:k=>attrs.add(k),removeAttribute:k=>attrs.delete(k)};
 const element=(box,attributes=[])=>({parentElement:null,box,attrs:new Set(attributes),getBoundingClientRect(){return this.box},hasAttribute(k){return this.attrs.has(k)},setAttribute(k){this.attrs.add(k)},removeAttribute(k){this.attrs.delete(k)}});
 const close=element({x:16,y:16,width:44,height:44},['data-player-close']);
 const controls=element({x:20,y:400,width:960,height:80},['data-visible']);
 const timeline=element({x:20,y:400,width:960,height:44});
 const tooltip=element({x:380,y:240,width:224,height:140});
 const menu=element({x:0,y:0,width:300,height:400});
 const player={querySelectorAll:()=>[close,timeline]};
 const document=new EventTarget();Object.assign(document,{documentElement:root,head:{appendChild(){}},createElement:()=>({}),querySelector:s=>s.includes('seek-tooltip')?tooltip:s.includes('controls')?controls:s.includes('media-player')?player:null,querySelectorAll:s=>s.includes('data-player-close')?[close]:menuOpen?[menu]:[]});
 const window={webkit:{messageHandlers:{navigator:{postMessage:m=>sent.push(m)}}},addEventListener(){}};window.top=window;
 vm.runInNewContext(raw,{window,document,location:{origin:'https://navigator.test'},Event,innerWidth:1000,innerHeight:500,requestAnimationFrame:fn=>frames.push(fn),getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'}),MutationObserver:class{observe(){}disconnect(){}}});
 const flush=()=>{let limit=100;while(frames.length&&limit-->0)frames.shift()();assert.ok(limit>0,'Layout settles without a perpetual RAF loop')};
 window.NavigatorIOS.receive({type:'chrome-session',session:'chrome-one'});flush();
 assert.ok(sent.some(m=>m.type==='player-layout'),'Loading chrome works before a stream is available');
 window.navigatorDesktop.send({type:'load',session:'layout-one',url:'https://cdn.test/video'});flush();
 let layout=sent.find(m=>m.type==='player-layout');
 assert.equal(layout.session,'chrome-one');assert.equal(layout.exclusions.length,2);assert.equal(layout.close.width,44);assert.equal(layout.preview.width,224);
 assert.equal(attrs.has('data-native-materials'),false,'Keep web fallback until native geometry acknowledgement');
 window.NavigatorIOS.receive({type:'materials-ready',session:'old'});assert.equal(attrs.has('data-native-materials'),false);
 window.NavigatorIOS.receive({type:'materials-ready',session:'chrome-one'});assert.equal(attrs.has('data-native-materials'),true);flush();
 const queued=frames.length;window.NavigatorIOS.receive({type:'state',session:'layout-one',state:{position:3}});assert.equal(frames.length,queued,'Progress messages must not start a geometry sampling loop');
 window.navigatorDesktop.send({type:'stop',session:'old'});assert.equal(attrs.has('data-native-materials'),true,'A stale stop must not disable the current native overlay');
 menuOpen=true;window.NavigatorIOS.receive({type:'layout-request'});flush();
 assert.equal(sent.filter(m=>m.type==='player-layout').at(-1).blocked,true);
 window.navigatorDesktop.send({type:'stop',session:'layout-one'});window.NavigatorIOS.receive({type:'chrome-session',session:''});assert.equal(attrs.has('data-native-materials'),false);assert.equal(close.attrs.has('aria-hidden'),false);
 assert.equal(window.navigatorDesktop.capabilities.nativeSurfaceGestures,true);
 assert.equal(window.navigatorDesktop.capabilities.nativeMaterials,true);
 console.log('PASS: iOS geometry coalescing, control exclusions, native acknowledgement, stale sessions, modal blocking, and fallback restoration');
}
