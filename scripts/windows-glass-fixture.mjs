// Runs the production NativePlayerGlass effect against actual native video.
import { createServer } from 'node:http';
import { readFileSync, createReadStream, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..');
const css=['components/desktop/native-playback.css','components/player-mobile.css'].map(p=>readFileSync(resolve(root,p),'utf8')).join('\n');
const controller=ts.transpileModule(readFileSync(resolve(root,'components/native-player-glass.tsx'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const html=`<!doctype html><html><head><style>${css}
:root{--background:#111;--foreground:#fff;font:18px 'Segoe UI',sans-serif;color:white}
body{margin:0}.panel{position:fixed;width:240px;padding:24px;border-radius:14px;border:1px solid #fff3}
.preview{left:10%;top:30%}.menu{right:10%;top:30%;background:#1116}.subtitle{left:50%;bottom:12%;transform:translateX(-50%);background:#0003;text-align:center}
[aria-hidden=true]{visibility:hidden}
</style></head><body>
<div class="panel preview" data-player-glass>Preview glass</div>
<div class="panel menu" data-player-native-glass>Speed<br><br>Subtitles</div>
<div class="panel subtitle" data-player-native-glass>Subtitle glass</div>
<script>
const bridge=window.navigatorDesktop, cleanups=[];
let attached=false,frames=0,painted=false;
const NativePlayerGlass=(()=>{const exports={};const require=name=>name==='react'?{useEffect:fn=>cleanups.push(fn())}:name.endsWith('/bridge')?{desktopBridge:()=>bridge}:{};
${controller}
return exports.NativePlayerGlass;})();
bridge.subscribe(message=>{
 if(message.type==='ready'&&!attached){attached=true;document.documentElement.dataset.nativePlaying='';NativePlayerGlass({mediaRef:{current:{controller:{previewSession:'glass-fixture'}}},sourceKey:'fixture',ready:true});}
 if(message.type==='glass-frame'){
  frames++;
  if(frames>=3&&!painted){painted=true;
   setTimeout(async()=>{
    const panels=[...document.querySelectorAll('.panel')];
    const material=panels.map(node=>({painted:node.hasAttribute('data-native-glass'),image:node.style.getPropertyValue('--native-glass-image').startsWith('url("data:image/bmp;base64,'),x:node.style.getPropertyValue('--native-glass-x'),y:node.style.getPropertyValue('--native-glass-y')}));
    await fetch('/painted',{method:'POST',body:JSON.stringify({frames,material,bytes:message.src.length})});
    setTimeout(()=>{
     for(const node of panels)node.setAttribute('aria-hidden','true');
     setTimeout(()=>{const stoppedAt=frames;setTimeout(()=>{for(const cleanup of cleanups)cleanup?.();fetch('/completed',{method:'POST',body:JSON.stringify({frames,stopped:frames===stoppedAt})});},1200);},300);
    },2000);
   },100);
  }
 }
});
bridge.send({type:'app-ready',dark:true});bridge.send({type:'load',session:'glass-fixture',url:location.origin+'/video.mp4',headers:{}});
</script></body></html>`;
createServer((req,res)=>{
 if(req.url==='/video.mp4'){res.writeHead(200,{'Content-Type':'video/mp4'});createReadStream(resolve(root,'scripts/fixtures/seek-preview.mp4')).pipe(res);}
 else if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);}
 else if(['/painted','/completed'].includes(req.url)){
  let body='';req.on('data',chunk=>{body+=chunk;if(body.length>65536)req.destroy();});req.on('end',()=>{writeFileSync(process.env.NAVIGATOR_GLASS_RESULT+req.url.replace('/','.')+'.json',body);res.writeHead(204);res.end();});
 }else{res.writeHead(404);res.end();}
}).listen(37381,'127.0.0.1',()=>writeFileSync(process.env.NAVIGATOR_GLASS_RESULT+'.ready','ready'));
