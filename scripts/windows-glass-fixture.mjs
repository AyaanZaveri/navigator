// Runs the production NativePlayerGlass effect against actual native video.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..');
const css=['components/desktop/native-playback.css','components/player-mobile.css','components/arc/dropdown-menu/dropdown-menu.module.css'].map(p=>readFileSync(resolve(root,p),'utf8').replaceAll(/:global\(([^)]+)\)/g,'$1')).join('\n');
const controller=ts.transpileModule(readFileSync(resolve(root,'components/native-player-glass.tsx'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
// Twelve seconds of local moving color bars keep the decoder active while
// the test hides glass; EOF must not accidentally make a demand-stop test pass.
const chunks=[Buffer.from('YUV4MPEG2 W320 H180 F60:1 Ip A1:1 C420jpeg\n')];
for(let f=0;f<720;f++){
 const pixels=Buffer.alloc(320*180*3/2);
 for(let y=0;y<180;y++)for(let x=0;x<320;x++)pixels[y*320+x]=32+(Math.floor((x+f*2)/40)%7)*30;
 pixels.fill(90,320*180,320*180*5/4);pixels.fill(180,320*180*5/4);
 chunks.push(Buffer.from('FRAME\n'),pixels);
}
const video=process.env.NAVIGATOR_GLASS_VIDEO?readFileSync(process.env.NAVIGATOR_GLASS_VIDEO):Buffer.concat(chunks);
const html=`<!doctype html><html><head><style>${css}
:root{--background:#111;--popover:#18181b;--foreground:#fff;--border:#fff3;--layer-overlay:100;font:18px 'Segoe UI',sans-serif;color:white}
body{margin:0}.panel{position:fixed;width:240px;padding:24px;border-radius:14px;border:1px solid #fff3}
.preview{left:10%;top:30%}.menu{position:fixed;right:10%;top:30%;--radix-dropdown-menu-content-available-width:600px;--radix-dropdown-menu-content-available-height:600px}.subtitle{left:50%;bottom:12%;transform:translateX(-50%);background:#0003;text-align:center}
[aria-hidden=true]{visibility:hidden}
</style></head><body>
<div class="panel preview" data-player-glass>Preview glass</div>
<div class="panel menu" role="menu" data-state="open" data-player-native-glass>Speed<br><br>Subtitles</div>
<div class="panel subtitle" data-player-native-glass>Subtitle glass</div>
<script>
const bridge=window.navigatorDesktop, cleanups=[];
let attached=false,frames=0,painted=false,measuring=true;const arrivals=[],changes=[],paints=[],drops=[],raf=[];
let previousImage='',state={};
const rafStart=performance.now();requestAnimationFrame(function tick(t){if(measuring)raf.push(t);if(performance.now()-rafStart<20000)requestAnimationFrame(tick);});
new MutationObserver(()=>{const image=document.querySelector('.preview').style.getPropertyValue('--native-glass-image');if(image&&image!==previousImage){previousImage=image;if(measuring)paints.push(performance.now());}}).observe(document.querySelector('.preview'),{attributes:true,attributeFilter:['style']});
const NativePlayerGlass=(()=>{const exports={};const require=name=>name==='react'?{useEffect:fn=>cleanups.push(fn())}:name.endsWith('/bridge')?{desktopBridge:()=>bridge}:{};
${controller}
return exports.NativePlayerGlass;})();
bridge.subscribe(message=>{
 if(message.type==='state')state=message.state;
 if(message.type==='state'&&measuring&&typeof message.state.droppedFrames==='number')drops.push({at:performance.now(),dropped:message.state.droppedFrames,decoder:message.state.decoderDroppedFrames??0});
 if(message.type==='ready'&&!attached){attached=true;document.documentElement.dataset.nativePlaying='';NativePlayerGlass({mediaRef:{current:{controller:{previewSession:'glass-fixture'}}},sourceKey:'fixture',ready:true});}
 if(message.type==='glass-frame'){
  frames++;if(measuring){arrivals.push(performance.now());changes.push(message.src);}
  if(frames>=3&&!painted){painted=true;
   setTimeout(async()=>{
    const panels=[...document.querySelectorAll('.panel')];
    const material=panels.map(node=>({painted:node.hasAttribute('data-native-glass'),image:node.style.getPropertyValue('--native-glass-image').startsWith('url("data:image/bmp;base64,'),x:node.style.getPropertyValue('--native-glass-x'),y:node.style.getPropertyValue('--native-glass-y'),tint:getComputedStyle(node,'::after').backgroundColor,dropdownOpacity:getComputedStyle(node).getPropertyValue('--dropdown-opacity')}));
    await fetch('/painted',{method:'POST',body:JSON.stringify({frames,material,bytes:message.src.length})});
    setTimeout(async()=>{
     measuring=false;
     const gaps=arrivals.slice(1).map((t,i)=>t-arrivals[i]).sort((a,b)=>a-b);
     const paintGaps=paints.slice(1).map((t,i)=>t-paints[i]).sort((a,b)=>a-b);
     const metrics={fps:(arrivals.length-1)*1000/(arrivals.at(-1)-arrivals[0]),p95GapMs:gaps[Math.floor(gaps.length*.95)],paintFps:(paints.length-1)*1000/(paints.at(-1)-paints[0]),p95PaintGapMs:paintGaps[Math.floor(paintGaps.length*.95)],uniqueFrames:new Set(changes).size,rafFps:(raf.length-1)*1000/(raf.at(-1)-raf[0]),videoDropIncrease:drops.length?drops.at(-1).dropped-drops[0].dropped:null,decoderDropIncrease:drops.length?drops.at(-1).decoder-drops[0].decoder:null};
     const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
     bridge.send({type:'pause',session:'glass-fixture'});await wait(300);
     const pausedAt=frames;await wait(500);const pausedCached=frames===pausedAt;
     const until=async test=>{const end=performance.now()+2500;while(!test()&&performance.now()<end)await wait(20);return test();};
     const seekStarted=performance.now();bridge.send({type:'seek',session:'glass-fixture',position:3});
     const pausedSeekUpdated=await until(()=>frames>pausedAt&&!state.seeking&&Math.abs((state.position??0)-3)<.25);
     metrics.pausedSeekMs=performance.now()-seekStarted;
     const seekAt=frames,resumeStarted=performance.now();
     bridge.send({type:'play',session:'glass-fixture'});const resumed=await until(()=>frames>seekAt&&!state.paused&&!state.seeking&&!state.buffering&&(state.position??0)>3.05);
     metrics.resumeMs=performance.now()-resumeStarted;
     for(const node of panels)node.setAttribute('aria-hidden','true');
     await wait(300);const stoppedAt=frames;await wait(1200);
     for(const cleanup of cleanups)cleanup?.();
     fetch('/completed',{method:'POST',body:JSON.stringify({...metrics,frames,stopped:frames===stoppedAt,pausedCached,pausedSeekUpdated,resumed})});
    },5000);
   },100);
  }
 }
});
bridge.send({type:'app-ready',dark:true});bridge.send({type:'load',session:'glass-fixture',url:location.origin+'/video.y4m',headers:{}});
</script></body></html>`;
createServer((req,res)=>{
 if(req.url==='/video.y4m'){
  const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range??'');
  const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),video.length-1):video.length-1;
  if(start>end||start>=video.length){res.writeHead(416,{'Content-Range':`bytes */${video.length}`});res.end();return;}
  res.writeHead(range?206:200,{'Content-Type':'application/octet-stream','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${video.length}`}:{})});res.end(video.subarray(start,end+1));
 }
 else if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);}
 else if(['/painted','/completed'].includes(req.url)){
  let body='';req.on('data',chunk=>{body+=chunk;if(body.length>65536)req.destroy();});req.on('end',()=>{writeFileSync(process.env.NAVIGATOR_GLASS_RESULT+req.url.replace('/','.')+'.json',body);res.writeHead(204);res.end();});
 }else{res.writeHead(404);res.end();}
}).listen(37381,'127.0.0.1',()=>writeFileSync(process.env.NAVIGATOR_GLASS_RESULT+'.ready','ready'));
