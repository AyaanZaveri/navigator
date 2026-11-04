const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const { load, hooks } = require('./test-support/react-hooks.cjs');
const globals = { AbortController, AbortSignal, Response, Request, URL, URLSearchParams };
const sequence = load('lib/media/episode-continuation.ts', {}, globals);
const prefetch = load('lib/media/prefetch-next-episode.ts', {
  './fetch-playback-streams': {}, './fetch-playback-details': {}, './resolve-playback': {}, './playback-details': {},
  './stream-metadata': {}, './playback-preferences': {},
}, globals);
const prefs = load('lib/media/playback-preferences.ts');
const titles = load('lib/media/playback-titles.ts');
const media = { id: 'tt1442437', seriesId: 'tt1442437', type: 'series', mediaSourceId: 'tt1442437:6:6',
  seasonNumber: 6, episodeNumber: 6, name: 'Halloween', showName: 'Modern Family', streamUrl: 'https://test/old.mp4', resumePositionTicks: 800,
  navigatorActionId: 'old-action', details: { id: 'tt1442437', type: 'series', name: 'Modern Family', logo: '/logo.png' } };
const next = { id: 'tt1442437:6:7', title: 'Queer Eyes, Full Hearts', season: 6, episode: 7 };
const clone = value => JSON.parse(JSON.stringify(value));
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; }
async function tick() { for(let i=0;i<12;i++) await Promise.resolve(); }
function controller(overrides={}) {
  const calls={lookup:0,prepare:0,warm:0,play:[],stop:[]};
  const instance = new sequence.EpisodeContinuation({ current:()=>media,season:6,episode:6,
    lookup:async()=>{ calls.lookup++; return next; },
    prepare:async target=>{ calls.prepare++; return {...target,streamUrl:'https://test/next.mp4',detailsLoaded:true}; },
    warm:async()=>{ calls.warm++; },play:target=>calls.play.push(target),beforeAdvance:ended=>calls.stop.push(ended),...overrides });
  return { instance,calls };
}
(async()=>{
  for(const [time,duration,wanted] of [[0,1000,false],[800,1000,false],[910,1000,true],[999,1000,true],[1000,1000,false],[79,100,false],[80,100,true],[10,NaN,false],[1,Infinity,false]])
    assert.equal(sequence.shouldPrefetchEpisode(time,duration),wanted);
  const target=sequence.nextEpisodeRequest(media,next);
  assert.equal(target.mediaSourceId,next.id); assert.equal(target.episodeTitle,next.title);
  for(const field of ['streamUrl','resumePositionTicks','navigatorActionId','streamRequest']) assert.equal(target[field],undefined);
  assert.equal(target.details.logo,'/logo.png');
  let {instance,calls}=controller();
  await Promise.all([instance.next(),instance.next(),instance.prefetch(),instance.prefetch()]);
  for(let i=0;i<30;i++) await instance.prefetch();
  assert.equal(calls.lookup,1); assert.equal(calls.prepare,1); assert.equal(calls.warm,1);
  await Promise.all([instance.advance(true),instance.advance(true),instance.advance(false)]);
  assert.equal(calls.play.length,1); assert.deepEqual(calls.stop,[true]); assert.equal(calls.play[0].streamUrl,'https://test/next.mp4');
  instance.dispose();
  ({instance,calls}=controller()); await instance.advance();
  assert.equal(calls.prepare,0,'Prefetch off uses the normal loader without speculative stream reads');
  assert.equal(calls.play[0].streamUrl,undefined); assert.deepEqual(calls.stop,[false]);

  let clock=1000; ({instance,calls}=controller({now:()=>clock})); await instance.prefetch();
  clock+=sequence.NEXT_EPISODE_PREFETCH_TTL+1; await instance.advance(true);
  assert.equal(calls.prepare,2,'Old signed stream preparations are refreshed after a long pause');
  const pending=deferred(); ({instance,calls}=controller({prepare:()=>pending.promise}));
  const warm=instance.prefetch(); await tick(); const move=instance.advance(true); instance.dispose();
  pending.resolve({...target,streamUrl:'https://test/next.mp4'}); await Promise.all([warm,move]);
  assert.equal(calls.play.length,0,'Closing/changing episodes while prefetch waits cannot start another title');
  assert.equal(calls.stop.length,0);
  const waiting=deferred(); ({instance,calls}=controller({lookup:()=>waiting.promise}));
  const cancel=instance.prefetch(); instance.cancelPrefetch(); waiting.resolve(next); await cancel;
  assert.equal(calls.prepare,0,'Turning prefetch off cancels it even during episode lookup');
  await instance.prefetch(); assert.equal(calls.prepare,1,'Turning it back on permits one new preparation');
  ({instance,calls}=controller({prepare:async()=>{throw Error('offline');}})); await instance.prefetch(); await instance.advance(true);
  assert.equal(calls.play.length,1); assert.equal(calls.play[0].streamUrl,undefined,'Failed prefetch falls back to normal playback');
  for(const episode of [null,{...next,season:6,episode:6},{...next,season:0},{...next,released:'2999-01-01'}]) {
    ({instance,calls}=controller({lookup:async()=>episode})); assert.equal(await instance.advance(true),false); assert.equal(calls.play.length,0);
  }
  let lookups=0; ({instance,calls}=controller({lookup:async()=>{if(!lookups++) throw Error('offline');return next;}}));
  assert.equal(await instance.next(),null); assert.ok(await instance.advance(true),'A transient lookup failure can recover on advance');

  const web={...target,streamUrl:'https://test/next.mp4'},signal=new AbortController().signal;
  let range;
  const read=await prefetch.warmEpisodeOpening(web,signal,async(url,options)=>{
    range=options.headers.Range; return new Response(new Uint8Array(128),{status:206,headers:{'Content-Range':'bytes 0-127/5000'}});
  });
  assert.equal(read,128); assert.equal(range,`bytes=0-${prefetch.EPISODE_OPENING_BYTES-1}`);
  let cancelled=false;
  assert.equal(await prefetch.warmEpisodeOpening(web,signal,async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:200})),0);
  assert.ok(cancelled,'Servers ignoring Range are cancelled without downloading the whole episode');
  assert.equal(await prefetch.warmEpisodeOpening(web,signal,async()=>new Response(new Uint8Array(prefetch.EPISODE_OPENING_BYTES+1),{status:206})),0);
  assert.equal(await prefetch.warmEpisodeOpening({...web,requestHeaders:{Authorization:'private'}},signal,()=>{throw Error('Must not forward native-only headers');}),0);
  assert.equal(await prefetch.warmEpisodeOpening({...web,streamUrl:'https://test/next.m3u8'},signal,()=>{throw Error('Do not range-warm manifests');}),0);
  const aborted=new AbortController();aborted.abort();
  assert.equal(await prefetch.warmEpisodeOpening(web,aborted.signal,()=>{throw Error('Must not fetch after cancel');}),0);

  function hookHarness(preferences={...prefs.DEFAULT_PLAYBACK_PREFERENCES,episodePrefetch:true}) {
    const host=hooks(),played=[],stopped=[],finished=[],requests=[];
    const {useEpisodeContinuation}=load('lib/media/use-episode-continuation.ts',{
      react:host.react,'@/contexts/settings-context':{useSettings:()=>({playbackPreferences:preferences})},
      './episode-continuation':sequence,'./playback-preferences':prefs,'./playback-titles':titles,
      './prefetch-next-episode':{fetchFollowingEpisode:async(id,season,episode,signal)=>{requests.push(signal);return {...next,id:`${id}:${season}:${episode+1}`,season,episode:episode+1};},
        prepareNextEpisode:async target=>({...target,streamUrl:'https://test/prepared.mp4'}),warmEpisodeOpening:async()=>{}},
    });
    const options={media,visible:true,native:false,time:0,duration:1000,play:target=>played.push(target),beforeAdvance:value=>stopped.push(value),finish:()=>finished.push(true)};
    const render=()=>{ const value=host.render(()=>useEpisodeContinuation(options));host.flush();return value; };
    return {host,render,preferences,options,played,stopped,finished,requests};
  }
  let h=hookHarness(); h.render(); await tick(); h.options.time=920; let value=h.render(); await tick();
  value=h.render();value.onEnded();value.onEnded(); await tick();
  assert.equal(h.played.length,1);assert.deepEqual(h.stopped,[true]);assert.equal(h.finished.length,0);assert.equal(h.played[0].streamUrl,'https://test/prepared.mp4');h.host.unmount();
  h=hookHarness();h.render();await tick();value=h.render();value.advance();await tick();value.onEnded();await tick();
  assert.equal(h.played.length,1);assert.equal(h.finished.length,0,'An ended event after manual Next cannot close the next episode');h.host.unmount();
  h=hookHarness({...prefs.DEFAULT_PLAYBACK_PREFERENCES,episodeAutoplay:false});value=h.render();await tick();value=h.render();value.onEnded();value.onEnded();await tick();
  assert.equal(h.played.length,0);assert.equal(h.finished.length,1,'Disabled autoplay closes normally, once');h.host.unmount();
  h=hookHarness();h.render();await tick();const old=h.render();h.options.media={...media,episodeNumber:8,mediaSourceId:'tt1442437:6:8'};h.render();old.onEnded();await tick();
  assert.equal(h.finished.length,0,'An old ended callback cannot close the newly selected episode');h.host.unmount();
  h=hookHarness();h.render();h.host.replay();await tick();value=h.render();
  assert.ok(h.requests[0].aborted);assert.equal(h.requests.at(-1).aborted,false,'Strict Mode replay creates a live continuation');
  value.onEnded();await tick();assert.equal(h.played.length,1);h.host.unmount();
  h=hookHarness();h.options.media={id:'movie',type:'movie',name:'Movie'};value=h.render();value.onEnded();await tick();assert.equal(h.requests.length,0);assert.equal(h.finished.length,1);h.host.unmount();

  const audio=load('lib/media/audio-language.ts');
  const resolver=load('lib/media/resolve-playback.ts',{'@/lib/media/audio-language':audio});
  const shared={id:next.id,type:'series',canonicalId:Promise.resolve(next.id),promise:Promise.resolve([
    {url:'https://test/first.mkv',title:'English HEVC DTS'}, {url:'https://test/next.mp4',title:'English H264 AAC'},
  ])};
  let preparations=0;
  const preparedApi=load('lib/media/prefetch-next-episode.ts',{
    './fetch-playback-streams':{createPlaybackStreamRequest:(id,type,signal)=>{assert.equal(id,next.id);assert.equal(type,'series');assert.equal(signal.aborted,false);preparations++;return shared;}},
    './fetch-playback-details':{fetchPlaybackDetails:async target=>({id:target.id,type:'series',name:'Modern Family',logo:'/prepared-logo.png'})},
    './resolve-playback':resolver,'./playback-details':require('./test-support/playback-context.cjs').details,
    './stream-metadata':{probeStreamMetadata:async()=>undefined},'./playback-preferences':prefs,
  },globals);
  const ready=await preparedApi.prepareNextEpisode(target,true,new AbortController().signal);
  assert.equal(ready.mediaSourceId,next.id);assert.equal(ready.streamRequest,shared);assert.equal(ready.details.logo,'/prepared-logo.png');assert.equal(ready.detailsLoaded,true);
  await resolver.resolvePlayback(ready,{fetchStreams(){throw Error('Prepared playback must not refetch streams');}},()=>{});
  assert.equal(preparations,1);
  for (const autoSelectWebStream of [false,true]) {
    prefs.savePlaybackPreferences({...prefs.DEFAULT_PLAYBACK_PREFERENCES,autoSelectWebStream});
    const prepared=await preparedApi.prepareNextEpisode(target,false,new AbortController().signal);
    assert.equal(prepared.streamUrl,autoSelectWebStream?'https://test/next.mp4':'https://test/first.mkv',
      'Preloaded episodes honor the same web stream selection preference');
  }
  prefs.savePlaybackPreferences(prefs.DEFAULT_PLAYBACK_PREFERENCES);

  // Execute the actual GlobalMediaPlayer ended handler with the hook result.
  const source=fs.readFileSync('components/global-media-player.tsx','utf8');
  const ast=ts.createSourceFile('player.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let endedCallback;
  function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='handleVideoEnded') endedCallback=node.initializer.arguments[0].getText(ast);ts.forEachChild(node,visit);}visit(ast);
  h=hookHarness();h.render();await tick();value=h.render();const video={};
  const onEnded=vm.runInNewContext(ts.transpileModule(`(${endedCallback})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,
    {videoRef:{current:video},episodeContinuationRef:{current:value},handleClose(){throw Error('Shared episode continuation should handle ended');}});
  onEnded({currentTarget:{}});assert.equal(h.played.length,0,'Detached old video events are ignored');
  onEnded({currentTarget:video});onEnded({currentTarget:video});await tick();assert.equal(h.played.length,1);h.host.unmount();

  const {GET}=load('app/api/playback/next-episode/route.ts',{'@/app/actions/auth':{getAuthData:async()=>({})}, "@/lib/server/auth": { getAuthData:async()=>({}) },'@/app/actions/tv-shows':{getFollowingEpisodeForSeries:async()=>next}},globals);
  assert.equal((await GET(new Request('http://test/api/playback/next-episode?id=tt1442437&season=6&episode=6'))).status,200);
  assert.equal((await GET(new Request('http://test/api/playback/next-episode?id=bad/id&season=6&episode=6'))).status,400);
  const unauthorized=load('app/api/playback/next-episode/route.ts',{'@/app/actions/auth':{getAuthData:async()=>{throw Error('signed out');}}, "@/lib/server/auth": { getAuthData:async()=>{throw Error('signed out');} },'@/app/actions/tv-shows':{getFollowingEpisodeForSeries:async()=>{throw Error('Must authenticate first');}}},globals);
  assert.equal((await unauthorized.GET(new Request('http://test/api/playback/next-episode?id=tt1442437&season=6&episode=6'))).status,401);
  console.log('PASS: episode autoplay on/off, Next parity, one-shot preparation, bounds, expiration, cancellation, stale callbacks, Strict Mode, movie/finale guards, bounded range warming and authenticated endpoint validation');
})().catch(error=>{console.error(error);process.exitCode=1});
