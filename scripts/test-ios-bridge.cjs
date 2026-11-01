const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const raw=fs.readFileSync('ios/Navigator/Resources/bridge.js','utf8').replace('__NAVIGATOR_ORIGIN__',JSON.stringify('https://navigator.test')).replace('__NAVIGATOR_STYLES__',JSON.stringify('body{}'));
function setup({frame=false,origin='https://navigator.test'}={}){
 const sent=[],observers=[];let visible=false;
 const document=new EventTarget();document.documentElement={dataset:{},hasAttribute:()=>visible};document.head={appendChild(){}};document.createElement=()=>({});document.querySelector=()=>null;
 const window={webkit:{messageHandlers:{navigator:{postMessage:m=>sent.push(m)}}},addEventListener(){}};window.top=frame?{}:window;
 vm.runInNewContext(raw,{window,document,location:{origin},Event,MutationObserver:class{constructor(fn){observers.push(fn)}observe(){}disconnect(){}}});
 return{window,sent,visible(v){visible=v;observers.forEach(fn=>fn())}};
}
const app=setup(),bridge=app.window.navigatorDesktop;
assert.equal(bridge.platform,'ios');assert.equal(bridge.engine,'vlc');assert.equal(bridge.capabilities.nativePreviews,true);assert.equal(bridge.capabilities.pip,false);
let received;const remove=bridge.subscribe(m=>received=m);
app.window.NavigatorIOS.receive({type:'state',session:'one',state:{position:4}});assert.equal(received.state.position,4);remove();
app.visible(true);assert.deepEqual(JSON.parse(JSON.stringify(app.sent.at(-1))),{type:'visible',value:true});
const before=app.sent.length;app.visible(true);assert.equal(app.sent.length,before);
assert.equal(setup({frame:true}).window.navigatorDesktop,undefined);assert.equal(setup({origin:'https://attacker.test'}).window.navigatorDesktop,undefined);
const native=fs.readFileSync('ios/Navigator/NavigatorViewController.swift','utf8');
assert.match(native,/message\.frameInfo\.isMainFrame/);assert.match(native,/securityOrigin/);assert.match(native,/websiteDataStore = \.default/);
assert.ok(!fs.readFileSync('ios/Navigator/Resources/Info.plist','utf8').includes('UIRequiresFullScreen'));
console.log('PASS: iOS bridge origin/frame isolation, sessions, capabilities, visibility, persistent cookies, adaptive scene configuration');
