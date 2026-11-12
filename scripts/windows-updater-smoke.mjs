// Real Windows DLL test. Ephemeral loopback server and keys; never launches a payload.
import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { makeWindowsFeed } from './windows-update-feed.mjs';
import { fetchWinSparkle } from './fetch-winsparkle.mjs';
if (process.platform !== 'win32') throw new Error('Run this native updater smoke test only on Windows');
const directory = await mkdtemp(join(tmpdir(), 'navigator-update-fixture-'));
const vendor = await fetchWinSparkle();
await mkdir(join(directory, 'resources/lib'), { recursive: true });
await copyFile(join(vendor, 'WinSparkle.dll'), join(directory, 'resources/lib/WinSparkle.dll'));
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const key = publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64');
const bytes = Buffer.from('MZ signed fixture intercepted after verification; never executable');
const base = makeWindowsFeed({version:'99.0.0',tag:'fixture',filename:'Navigator-99.0.0-windows-x64-setup.exe',bytes,privateKey:privateKey.export({type:'pkcs8',format:'pem'}),publicKey:key});
const routes = new Map();
let requests = [];
const server = http.createServer((req,res) => {
  requests.push(req.url);
  const route=routes.get(req.url);
  if(!route){res.writeHead(404);res.end('missing');return;}
  res.writeHead(200, {'Content-Type':req.url.endsWith('.exe')?'application/octet-stream':'application/xml'});res.end(route);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const feed = base.replace(/https:\/\/github.com[^\"]+/,`${origin}/payload.exe`);
routes.set('/payload.exe',bytes);
routes.set('/valid.xml',feed);
routes.set('/current.xml',feed.replaceAll('99.0.0','0.0.1'));
routes.set('/equal.xml',feed.replaceAll('99.0.0',JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version));
routes.set('/empty.xml','<?xml version="1.0"?><rss version="2.0"><channel><title>Navigator</title></channel></rss>');
routes.set('/tampered.xml',feed.replace('/payload.exe','/tampered.exe'));
routes.set('/tampered.exe',Buffer.from(bytes).map((value,index)=>index===3 ? value^1 : value));
routes.set('/unsigned.xml',feed.replace(/ sparkle:edSignature="[^"]+"/,''));
routes.set('/malformed.xml','not an appcast');
const cases = [
 {name:'empty initial feed accepted',path:'/empty.xml',expected:'current',install:false},
 {name:'installed version ignored',path:'/equal.xml',expected:'current',install:false},
 {name:'older release ignored',path:'/current.xml',expected:'current',install:false},
 {name:'valid signed download accepted',path:'/valid.xml',expected:'installed',install:true},
 {name:'tampered download rejected',path:'/tampered.xml',expected:'error',install:true},
 {name:'unsigned download rejected',path:'/unsigned.xml',expected:'error',install:true},
 {name:'wrong signing key rejected',path:'/valid.xml',expected:'error',install:true,key:Buffer.alloc(32,7).toString('base64')},
 {name:'missing feed reported',path:'/missing.xml',expected:'error',install:false},
 {name:'malformed feed reported',path:'/malformed.xml',expected:'error',install:false},
];
const results=[];
try {
 for(const test of cases){
  requests=[];
  const config=join(directory,'fixture.json');
  await writeFile(config,JSON.stringify({directory,feed:origin+test.path,key:test.key??key,expected:test.expected,install:test.install}));
  await new Promise((resolveDone,reject)=>{
   const child=spawn('cargo',['test','--manifest-path','desktop/Cargo.toml','--target','x86_64-pc-windows-msvc','--release','--locked','windows_updater::tests::native_fixture','--','--ignored','--exact','--nocapture'],{env:{...process.env,NAVIGATOR_UPDATER_FIXTURE:config},windowsHide:true});
   let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
   const timeout=setTimeout(()=>{child.kill();reject(new Error(`${test.name}: test process timed out\n${output.slice(-4000)}`));},15*60*1000);
   child.on('error',reject);child.on('exit',code=>{clearTimeout(timeout);code===0?resolveDone():reject(new Error(`${test.name}: exit ${code}\n${output.slice(-5000)}`));});
  });
  assert.ok(requests.includes(test.path),'WinSparkle must actually fetch the fixture');
  results.push({case:test.name,passed:true,requests:[...requests]});console.log(`PASS: ${test.name}`);
 }
 const output=resolve(process.argv[2]||'dist/windows-updater-smoke.json');
 await mkdir(join(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(results,null,2));
 console.log(`Native updater results: ${output}`);
} finally {
 await new Promise(resolve=>server.close(resolve));
 await rm(directory,{recursive:true,force:true});
 await new Promise(done=>{const child=spawn('reg.exe',['delete','HKCU\\Software\\NavigatorUpdaterDownloadFixture','/f'],{stdio:'ignore',windowsHide:true});child.on('error',done);child.on('exit',done);});
}
