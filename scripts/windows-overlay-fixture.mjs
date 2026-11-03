// Native-app regression fixture. Uses the production playback and wordmark CSS.
import { createServer } from 'node:http';
import { readFileSync, createReadStream, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const css = readFileSync(resolve(root, 'components/desktop/native-playback.css'), 'utf8');
const wordmark = readFileSync(resolve(root, 'components/hero-wordmark.module.css'), 'utf8');
const video = resolve(root, 'scripts/fixtures/seek-preview.mp4');
const port = Number(process.env.NAVIGATOR_OVERLAY_PORT || 37379);
const fullscreenMode = process.env.NAVIGATOR_FULLSCREEN_TEST;
const fullscreenTest = Boolean(fullscreenMode);
const html = `<!doctype html><html><head><style>${css}\n${wordmark}
body{margin:0;color:white;font:20px system-ui}
[data-desktop-app-content]{position:fixed;inset:0}
.root{height:60vh}.root .artwork{position:absolute;inset:40px 0 auto;height:55vh;max-height:none;transform:none;background:rgb(31,231,117);display:grid;place-items:center;backdrop-filter:blur(12px)}
.caption{position:fixed;top:0;right:0;display:flex;height:32px;z-index:100}.caption button{width:46px;height:32px;background:none;border:0;color:white}html[data-desktop-fullscreen="true"] .caption{display:none}
.controls{position:fixed;bottom:24px;left:24px;background:#111b;padding:16px}
</style></head><body><div data-desktop-app-content><div class="root" data-ready><div class="artwork">MEDIA PAGE WORDMARK — MUST NOT COVER VIDEO</div></div></div><div class="controls">Native video / retained page regression check</div><div class="caption" data-no-window-drag><button aria-label="Minimize">−</button><button id="caption-fullscreen" aria-label="Enter fullscreen">⛶</button><button aria-label="Close window">×</button></div>
<script>
const bridge=window.navigatorDesktop;
// Match the actual app's caption button: native hit testing may deliver the
// non-client action, or WebView2 delivers this accessible DOM click handler.
document.getElementById('caption-fullscreen').addEventListener('click',()=>bridge.send({type:'window-control',action:'toggle-maximize'}));
bridge.subscribe(message=>{if(message.type==='ready') document.documentElement.dataset.nativePlaying='';});
${fullscreenTest ? `let entered=false,requested=false;
bridge.subscribe(message=>{
 if(message.type==='ready'&&!requested){requested=true;${fullscreenMode === '1' ? "setTimeout(()=>bridge.send({type:'fullscreen',value:true}),2000);" : "fetch('/fullscreen-state/ready');"}}
 if(message.type==='fullscreen'&&message.value){entered=true;fetch('/fullscreen-state/entered');${fullscreenMode === '1' ? "setTimeout(()=>bridge.send({type:'fullscreen',value:false}),6000);" : ''}}
 else if(message.type==='fullscreen'&&entered){fetch('/fullscreen-state/exited');}
});` : ''}
requestAnimationFrame(()=>requestAnimationFrame(()=>{bridge.send({type:'app-ready',dark:true});bridge.send({type:'load',session:'overlay-fixture',url:location.origin+'/video.mp4',headers:{}});}));
</script></body></html>`;
createServer((req,res)=>{
  if(fullscreenTest && ['/fullscreen-state/ready','/fullscreen-state/entered','/fullscreen-state/exited'].includes(req.url)){
    writeFileSync(process.env.NAVIGATOR_FULLSCREEN_RESULT, req.url.split('/').at(-1));res.writeHead(204);res.end();
  }
  else if(req.url==='/video.mp4'){res.writeHead(200,{'Content-Type':'video/mp4'});createReadStream(video).pipe(res);}
  else if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);}
  else{res.writeHead(404);res.end();}
}).listen(port,'127.0.0.1',()=>{
  if(process.env.NAVIGATOR_OVERLAY_READY)writeFileSync(process.env.NAVIGATOR_OVERLAY_READY,String(port));
  console.log('Native overlay fixture listening on loopback');
});
