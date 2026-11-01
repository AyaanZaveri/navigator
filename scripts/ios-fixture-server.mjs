import https from 'node:https';
import fs from 'node:fs';
const video=fs.readFileSync('scripts/fixtures/seek-preview.mp4');
const html=`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><body style="background:transparent;color:white;font:20px sans-serif"><button aria-label="Play fixture" id="play">Play fixture</button><button aria-label="Preview fixture" id="preview">Preview fixture</button><button aria-label="Close fixture" id="close">Close fixture</button><p id="status">Fixture ready</p><p id="resume"></p><p id="thumbnail"></p><script>
const bridge=window.navigatorDesktop;let last=0;const owner='ios-fixture-session';
bridge.subscribe(m=>{if(m.type==='state'&&m.session===owner)last=m.state.position;if(m.type==='ready'&&m.session===owner){document.getElementById('status').textContent='Native playback ready';if(last>=1.25)document.getElementById('resume').textContent='Resume position verified';}});
bridge.subscribe(m=>{if(m.type==='thumbnail'&&m.session===owner&&m.request===1&&m.position===1&&typeof m.src==='string'&&m.src.startsWith('data:image/jpeg;base64,'))document.getElementById('thumbnail').textContent='Native preview verified';});
document.getElementById('preview').onclick=()=>bridge.send({type:'thumbnail',session:owner,request:1,position:1});
document.getElementById('play').onclick=()=>{document.documentElement.setAttribute('data-native-playing','');bridge.send({type:'load',session:owner,url:'https://localhost:9443/protected.mp4',headers:{Authorization:'fixture-secret'},startPosition:1.5});};
document.getElementById('close').onclick=()=>{bridge.send({type:'stop',session:owner});document.documentElement.removeAttribute('data-native-playing');document.getElementById('status').textContent='Player closed';};
</script></body></html>`;
https.createServer({key:fs.readFileSync(process.env.FIXTURE_KEY),cert:fs.readFileSync(process.env.FIXTURE_CERT)},(req,res)=>{
  if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);return;}
  if(req.url!=='/protected.mp4'||req.headers.authorization!=='fixture-secret'){res.writeHead(403);res.end();return;}
  const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
  const start=match?Number(match[1]):0,end=match&&match[2]?Math.min(Number(match[2]),video.length-1):video.length-1;
  if(start>=video.length||end<start){res.writeHead(416,{'Content-Range':`bytes */${video.length}`});res.end();return;}
  const body=video.subarray(start,end+1),headers={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':body.length};
  if(match)headers['Content-Range']=`bytes ${start}-${end}/${video.length}`;
  res.writeHead(match?206:200,headers);res.end(req.method==='HEAD'?undefined:body);
}).listen(9443,'::',()=>process.stdout.write('iOS fixture ready\n'));
