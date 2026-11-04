// Opt-in live source-route task checks. No server or browser playback actions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const cases = {
  'title-navigation': { prompt: 'Open Interstellar (2014)', check: (tools, outputs) => { const action = prepared(tools, outputs, 'navigate'); assert.match(action.url, /^\/movie\/(?:tt0816692|tmdb:157336)$/); } },
  'title-playback': { prompt: 'Play Interstellar (2014)', check: (tools, outputs) => { const action = prepared(tools, outputs, 'play'); assert.equal(action.mediaId, 'tt0816692'); assert.doesNotMatch(JSON.stringify(tools), /skipToSubtitleContent/); } },
  'known-episode': { prompt: 'Play season 1 episode 1 of The Curse (2023)', check: (tools, outputs) => { const action = prepared(tools, outputs, 'play'); assert.equal(action.mediaId, 'tt13623608:1:1'); assert.doesNotMatch(JSON.stringify(tools), /getSeasons|getEpisodes/); } },
  'episode-information': { prompt: 'Which episode of Nathan for You is called The Anecdote?', check: (tools, outputs) => { assert.ok(tools.some(x => /findEpisode/i.test(x.toolName))); assert.match(JSON.stringify(outputs), /tmdb:58957:4:4/); assert.equal(outputs.filter(x => x.execution === 'prepared').length, 0); } },
  'theme': { prompt: 'Switch to light mode', check: (tools, outputs) => { const a = prepared(tools, outputs, 'theme'); assert.match(JSON.stringify(a), /light/i); } },
  'people': { prompt: 'Who directed Interstellar (2014)?', check: (tools, outputs, text) => { assert.ok(tools.some(x => /getMediaDetails|getPersonDetails|getFilmography/i.test(x.toolName))); assert.match(JSON.stringify(outputs), /Christopher Nolan/i); assert.match(text, /Christopher Nolan/i); assert.equal(outputs.filter(x => x.execution === 'prepared').length, 0); } },
};
function prepared(tools, outputs, action) {
  assert.equal(outputs.filter(x => x.execution === 'prepared').length, 1, 'exactly one prepared action');
  assert.match(JSON.stringify(tools), new RegExp(action, 'i'));
  return outputs.find(x => x.execution === 'prepared');
}

async function main() {
  if (process.argv.includes('--list')) { console.log(Object.keys(cases).join('\n')); return; }
  const arg = flag => { const i = process.argv.indexOf(flag); return i < 0 ? undefined : process.argv[i + 1]; };
  if (!process.argv.includes('--live')) { console.log('SKIP: pass --live to call configured services.'); return; }
  const caseId = arg('--case'), model = arg('--model');
  assert.ok(caseId && cases[caseId], 'Pass a valid --case (see --list)'); assert.ok(model, 'Pass --model <id>');
  process.loadEnvFile('.env');
  assert.ok(process.env.OPENCODE_GO_API_KEY && process.env.TMDB_API_READ_ACCESS_TOKEN && process.env.TINYFISH_API_KEY, 'Configure live credentials in .env');
  const deps = {};
  for (const n of ['ai','zod','@ai-sdk/openai','@ai-sdk/google','@ai-sdk/groq','@ai-sdk/cerebras','@ai-sdk/openai-compatible','@openrouter/ai-sdk-provider','ai-sdk-ollama']) deps[n] = await import(n);
  deps['server-only'] = {};
  deps['@/lib/server/outbound-fetch'] = { OutboundRequestError: class OutboundRequestError extends Error {}, outboundFetch: (...a) => fetch(...a), providerFetch: (...a) => fetch(...a), outboundUrl: v => new URL(v) };
  deps['@/lib/server/auth'] = { getAuthData: async () => ({ user: { _id: 'navigator-live-test' } }) };
  deps['next/headers'] = { cookies: async () => ({ get: () => undefined }) };
  deps['@/app/actions/auth'] = { getUser: async () => ({ _id: 'navigator-live-test' }), getInstalledAddons: async () => [{ manifest: { id:'org.stremio.opensubtitles', name:'OpenSubtitles', resources:['subtitles'] }, transportUrl:'https://opensubtitles-v3.strem.io/manifest.json' }] };
  deps['@/app/actions/media'] = { getStreamAddonTargets: async () => { throw Error('Playback enumeration prohibited'); }, fetchStreamsFromAddon: async () => { throw Error('Playback prohibited'); } };
  const modules = new Map(), services = [];
  function load(file) {
    const abs = path.resolve(file); if (modules.has(abs)) return modules.get(abs).exports;
    const mod = { exports:{} }; modules.set(abs, mod);
    const req = name => {
      if (deps[name]) return deps[name];
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(abs), name);
        const f = [base,base+'.ts',base+'.tsx',base+'/index.ts'].find(x => fs.existsSync(x) && fs.statSync(x).isFile());
        if (!f) throw Error(`Cannot resolve ${name}`); const alias='@/'+path.relative(process.cwd(),f).replace(/\.tsx?$/,''); return deps[alias] || load(f);
      } return require(name);
    };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs,'utf8'), { compilerOptions:{ target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true } }).outputText,
      { module:mod,exports:mod.exports,require:req,process,console:{log(){},warn(){},error(...a){if(process.argv.includes('--diagnostics')) console.error('[app]',...a.map(x=>x instanceof Error?{name:x.name,message:x.message}:'[details omitted]'));}},
        setTimeout,clearTimeout,setInterval,clearInterval,AbortController,AbortSignal,Error,TypeError,SyntaxError,Promise,Map,Set,WeakMap,WeakSet,Date,Math,JSON,RegExp,String,Number,Boolean,Array,Object,BigInt,Symbol,URL,URLSearchParams,Request,Response,Headers,ReadableStream,TextEncoder,TextDecoder,crypto:globalThis.crypto,globalThis,
        fetch:async (url,init)=>{const t=Date.now();const r=await fetch(url,init);services.push({host:new URL(url).hostname,status:r.status,ms:Date.now()-t});return r;} }, {filename:abs});
    return mod.exports;
  }
  const { POST } = load('app/api/chat/route.ts');
  const prompt = cases[caseId].prompt, start=Date.now();
  const response=await POST(new Request('http://localhost/api/chat',{method:'POST',signal:AbortSignal.timeout(120000),headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{id:'navigator-task-live',role:'user',parts:[{type:'text',text:prompt}]}],aiProvider:'opencode',opencodeModel:model,opencodeApiKey:process.env.OPENCODE_GO_API_KEY,opencodeSessionId:`navigator-task-${caseId}-${model}`,pathname:'/'})}));
  const body=await response.text();
  assert.equal(response.status,200,`HTTP ${response.status}: ${body.slice(0,1000)}`);
  const events=body.split('\n').filter(x=>x.startsWith('data: {')).map(x=>JSON.parse(x.slice(6)));
  const errors=events.filter(x=>x.type==='error'), tools=events.filter(x=>x.type==='tool-input-available').map(({toolName,input})=>({toolName,input})), outputs=events.filter(x=>x.type==='tool-output-available').map(x=>x.output);
  const text = events.filter(x => x.type === 'text-delta').map(x => x.delta || '').join('');
  const report={model,case:caseId,prompt,durationMs:Date.now()-start,httpStatus:response.status,tools,outputs,errors,text,services}; console.log(JSON.stringify(report));
  assert.equal(errors.length,0,'provider/route errors'); cases[caseId].check(tools,outputs,text);
  console.log(`PASS ${caseId} (${model})`);
}
main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
