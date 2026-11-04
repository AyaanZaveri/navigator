// Opt-in signed-in dev-server evaluation. No server/build, settings changes or browser action execution.
// node scripts/test-navigator-live.cjs --live [--suite scenes|routing|context] [--model MODEL] [--out /tmp/report.json]
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const model = arg('--model', 'muse-spark-1.3-contributor');
const suite = arg('--suite', 'routing');
const cases = suite === 'context' ? [
  ['context-shows', 'Find Nathan Fielder’s TV shows', ['searchPeople', 'getFilmography']],
  ['context-play', 'Play the first episode of The Rehearsal', ['playMedia']],
] : suite === 'scenes' ? [
  ['confession', 'Go to the confession in knives out 3', ['skipToSubtitleContent']],
  ['conquest', 'go to the scene where he fights conquest in invincible', ['skipToSubtitleContent']],
  ['docking', 'Go to the docking scene in Interstellar', ['skipToSubtitleContent']],
  ['reported-luna', 'Can you play that one episode of Nathan for you where he goes on Jimmy Kimmel and then can you skip to the scene where he goes on to the talk show', ['skipToSubtitleContent']],
  ['episode-scene', 'play the episode of Nathan for You where he goes on Jimmy Kimmel and skip to when he goes on the talk show', ['skipToSubtitleContent']],
  ['no-match', 'Go to the scene where SpongeBob meets Batman in Interstellar', ['skipToSubtitleContent'], null, false],
] : [
  ['people-shows', 'Find Nathan Fielder’s TV shows', ['searchPeople', 'getFilmography']],
  ['biography', 'Who is Walton Goggins?', ['searchPeople', 'getPersonDetails']],
  ['director', 'Show movies directed by Christopher Nolan', ['searchPeople', 'getFilmography']],
  ['movie', 'Play Inception', ['searchMedia', 'playMedia']],
  ['series', 'Play Severance', ['searchMedia', 'playMedia']],
  ['coordinates', 'Play season 2 episode 3 of Severance', ['searchMedia', 'playMedia']],
  ['navigate-known', 'Open Interstellar using its known TMDB movie ID tmdb:157336', ['navigateToMedia']],
  ['navigate-title', 'Open The Grand Budapest Hotel', ['navigateToMediaByQuery']],
  ['navigate-episode', 'Open season 1 episode 2 of Severance', ['navigateToEpisode']],
  ['episode-description', 'go to the episode of Nathan for You where he goes on Jimmy Kimmel', ['navigateToEpisode']],
  ['late-plural', 'go to the episode of late bloomers where she says "mein bhar jari hoon bitch"', ['navigateToEpisode']],
  ['late-quote', 'go to the episode of late bloomer where she says "mein bhar jari hoon bitch"', ['navigateToEpisode']],
  ['episode-information', 'Which episode of Nathan for You has Jimmy Kimmel?', ['findEpisode']],
  ['details', 'What is the runtime and cast of Interstellar?', ['searchMedia', 'getMediaDetails']],
  ['seasons', 'List the seasons of Severance', ['searchMedia', 'getSeasons']],
  ['episodes', 'List episodes in season 1 of Severance', ['searchMedia', 'getEpisodes']],
  ['streams', 'List available streams for Inception', ['searchMedia', 'getMediaStreams']],
  ['theme', 'Switch to dark mode', ['themeToggle']],
  ['fast-search', 'Search the web for Late Bloomer TV series. Return ten search results and links only; do not read or fetch any pages.', ['searchMediaWeb']],
  ['web', 'Use web search to find filming locations for Wake Up Dead Man', ['searchMediaWeb']],
  ['explain', 'Explain this scene', ['explainScene'], { currentMedia: { id: 'tt0816692', name: 'Interstellar', type: 'movie' }, currentTimestamp: 600 }],
  ['recap', 'Summarize what has happened so far', ['analyzeMedia'], { currentMedia: { id: 'tt0816692', name: 'Interstellar', type: 'movie' }, currentTimestamp: 600 }],
];
function browser(js) {
  const out = execFileSync('bladebro', ['act', 'eval', js], { encoding: 'utf8', env: { ...process.env, BLADE_CMD_TIMEOUT: '20' }, timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  const artifact = /full payload: (.+?) —/.exec(out);
  if (artifact) return JSON.parse(fs.readFileSync(artifact[1], 'utf8'));
  const result = out.slice(out.indexOf('result: ') + 8).trim();
  return JSON.parse(result);
}
async function runInPage(cases, model, suite, stateKey) {
  const state = window[stateKey] = { running: true, results: [] };
  const history = [];
  for (const [id, prompt, expectedTools, context, expectedSuccess = true] of cases) {
    const start = performance.now();
    const user = { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: prompt }] };
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(130000), body: JSON.stringify({
        aiProvider: 'opencode', opencodeModel: model, opencodeSessionId: 'navigator-live-eval-' + model,
        messages: [...(suite === 'context' ? history : []), user], ...context,
      }) });
      const body = await response.text();
      const events = body.split('\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)));
      const tools = events.filter(e => e.type === 'tool-input-available').map(e => ({ name: e.toolName, input: e.input }));
      if (suite === 'context') {
        history.push(user, { id: crypto.randomUUID(), role: 'assistant', parts: events.filter(e => e.type === 'tool-input-available').map(e => ({
          type: 'tool-' + e.toolName, toolCallId: e.toolCallId, state: 'output-available', input: e.input,
          output: events.find(o => o.type === 'tool-output-available' && o.toolCallId === e.toolCallId)?.output,
        })) });
      }
      const outputs = events.filter(e => e.type === 'tool-output-available').map(e => ({ tool: events.find(input => input.type === 'tool-input-available' && input.toolCallId === e.toolCallId)?.toolName, success: e.output.success, status: e.output.status, error: e.output.error,
        searchMs: e.output.searchMs, count: e.output.count, evidenceLevel: e.output.evidenceLevel, seriesName: e.output.seriesName, clueEvidence: e.output.clueEvidence, failureStage: e.output.failureStage, failureKind: e.output.failureKind, action: e.output.action, mediaId: e.output.mediaId, mediaName: e.output.mediaName, episodeTitle: e.output.episodeTitle,
        timestamp: e.output.timestamp, timings: e.output.timings, url: e.output.url }));
      const errors = events.filter(e => e.type === 'error');
      const names = tools.map(t => t.name);
      const pass = response.ok && !errors.length && expectedTools.every(t => names.includes(t))
        && outputs.length > 0 && expectedTools.every(name => outputs.some(output => output.tool === name && output.success === expectedSuccess))
        && (!expectedSuccess || outputs.every(output => output.success === true))
        && (!expectedTools.includes('skipToSubtitleContent') || names.every(n => n === 'skipToSubtitleContent'))
        && (id !== 'fast-search' || names.length === 1)
        && (id !== 'context-play' || names.length === 1)
        && (id !== 'coordinates' || !names.some(n => ['getSeasons', 'getEpisodes', 'getMediaStreams'].includes(n)));
      state.results.push({ id, prompt, model, progress: events.filter(e => e.type === 'data-episodeProgress').map(e => e.data), ms: Math.round(performance.now() - start), pass, status: response.status, tools, outputs, errors,
        text: events.filter(e => e.type === 'text-delta').map(e => e.delta).join('') });
    } catch (error) { state.results.push({ id, model, ms: Math.round(performance.now() - start), pass: false, error: String(error) }); }
  }
  state.running = false;
}
async function main() {
  if (!process.argv.includes('--live')) { console.log('SKIP: --live uses the signed-in Blade Bro tab and paid APIs; actions are prepared only.'); return; }
  const selectedCases = process.argv.includes('--case') ? cases.filter(item => item[0] === arg('--case')) : cases;
  if (!selectedCases.length) throw new Error('Unknown case');
  const stateKey = '__navigatorLiveEval_' + require('node:crypto').randomUUID().replaceAll('-', '');
  browser(`(() => { (${runInPage.toString()})(${JSON.stringify(selectedCases)}, ${JSON.stringify(model)}, ${JSON.stringify(suite)}, ${JSON.stringify(stateKey)}); return "started"; })()`);
  let count = 0;
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const state = browser(`window[${JSON.stringify(stateKey)}]`);
    for (const result of state.results.slice(count)) console.log(`${result.pass ? 'PASS' : 'FAIL'} ${model} ${result.id} ${result.ms}ms ${result.tools?.map(t => t.name).join(' → ') || result.error}`);
    count = state.results.length;
    if (!state.running) {
      const out = arg('--out', `/tmp/navigator-${suite}-${model}.json`);
      fs.writeFileSync(out, JSON.stringify({ model, suite, results: state.results }, null, 2));
      console.log(`${state.results.filter(r => r.pass).length}/${selectedCases.length} passed; report: ${out}`);
      if (state.results.some(r => !r.pass)) process.exitCode = 1;
      return;
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
