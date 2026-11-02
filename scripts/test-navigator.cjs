const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

async function main() {
  const ai = await import('ai');
  const { MockLanguageModelV4 } = await import('ai/test');
  const zod = await import('zod');
  let activeModel;
  let authenticated = true;
  let subtitleTracks = [];
  let subtitleContent = "";
  let tmdbToken = 'tmdb-test-token';
  let tmdbStatus = 200;
  const tmdbRequests = [];
  let streamLookups = 0;
  let episodeMetadataUnavailable = false;
  const movieFixture = { id: 123, title: 'Example', overview: 'A TMDB synopsis.', release_date: '2020-01-02', vote_average: 8, vote_count: 10, poster_path: '/poster.jpg', media_type: 'movie' };
  async function tmdbFetch(input, init) {
    const url = new URL(input);
    assert.equal(url.hostname, 'api.themoviedb.org', 'Discovery must never fetch a Stremio add-on');
    tmdbRequests.push({ url, init });
    const endpoint = url.pathname.replace('/3/', '');
    let data;
    if (endpoint.startsWith('search/')) data = { page: 1, total_pages: 1, total_results: 1, results: [movieFixture] };
    else if (endpoint.startsWith('find/')) data = { movie_results: [movieFixture], tv_results: [] };
    else if (endpoint === 'movie/123/external_ids') data = { imdb_id: 'tt123' };
    else if (endpoint === 'movie/123') data = { ...movieFixture, title: 'Viewed title', external_ids: { imdb_id: 'tt123' }, genres: [], credits: { cast: [], crew: [] } };
    else if (endpoint === 'tv/114294/external_ids') data = { imdb_id: 'tt13623608' };
    else if (endpoint === 'tv/114294') data = { id: 114294, name: 'The Curse', seasons: [{ season_number: 1, name: 'Season 1', episode_count: 10, poster_path: '/season.jpg' }] };
    else if (endpoint === 'tv/114294/season/1') data = { episodes: [{ id: 1, name: 'Land of Enchantment', season_number: 1, episode_number: 1, still_path: '/episode.jpg' }] };
    else if (endpoint === 'tv/114294/season/1/episode/1') data = { id: 1, name: 'Land of Enchantment', season_number: 1, episode_number: 1, still_path: '/episode.jpg' };
    else throw new Error('Unexpected TMDB endpoint: ' + endpoint);
    return new Response(JSON.stringify(data), { status: episodeMetadataUnavailable && endpoint.includes('/episode/') ? 404 : tmdbStatus, headers: { 'content-type': 'application/json' } });
  }
  const provider = () => activeModel;
  provider.responses = provider;
  const modules = new Map();
  const overrides = {
    ai, zod,
    "server-only": {},
    "@/lib/tmdb-credentials": { getTMDBToken: async () => tmdbToken },
    '@ai-sdk/google': { google: provider, createGoogle: () => provider },
    '@ai-sdk/openai': { openai: provider, createOpenAI: () => provider },
    '@ai-sdk/groq': { groq: provider, createGroq: () => provider },
    '@ai-sdk/cerebras': { cerebras: provider, createCerebras: () => provider },
    '@ai-sdk/openai-compatible': { createOpenAICompatible: () => provider },
    '@openrouter/ai-sdk-provider': { openrouter: provider, createOpenRouter: () => provider },
    'ai-sdk-ollama': { createOllama: () => provider },
    'next/headers': { cookies: async () => ({ get: () => authenticated ? { value: JSON.stringify({ user: { _id: 'test-user' } }) } : undefined }) },
    '@/app/actions/search': { searchItems: async () => { throw new Error('Add-on search is forbidden'); } },
    '@/app/actions/media': {
      fetchMediaDetails: async () => { throw new Error('Add-on metadata is forbidden'); },
      getStreamAddonTargets: async () => { streamLookups++; return []; }, fetchStreamsFromAddon: async () => [],
    },
    '@/app/actions/tv-shows': { fetchEpisodes: async () => [], fetchSeasons: async () => [], fetchEpisodeDetails: async () => ({ id: 'show:1:2', title: 'Selected episode' }) },
    '@/app/actions/subtitles': { fetchSubtitleFileContent: async () => ({ success: true, content: subtitleContent }) },
    '@/app/actions/utils': { getSubtitleTracks: async () => subtitleTracks },
  };
  function load(file) {
    const absolute = path.resolve(file);
    if (modules.has(absolute)) return modules.get(absolute).exports;
    const module = { exports: {} };
    modules.set(absolute, module);
    const localRequire = name => {
      if (overrides[name]) return overrides[name];
      if (name.startsWith('@/') || name.startsWith('.')) {
        const resolved = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(absolute), name);
        const match = [resolved, `${resolved}.ts`, `${resolved}/index.ts`].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        if (!match) throw new Error(`Cannot resolve ${name} from ${file}`);
        return load(match);
      }
      return require(name);
    };
    const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(code, {
      module, exports: module.exports, require: localRequire, console: { log() {}, warn() {}, error() {} },
      process: { env: {} }, setTimeout, clearTimeout, AbortController, AbortSignal, Event, CustomEvent, Error, TypeError, SyntaxError,
      fetch: tmdbFetch, Request, Response, ReadableStream, TextEncoder, TextDecoder, URL, URLSearchParams, crypto: globalThis.crypto,
    }, { filename: absolute });
    return module.exports;
  }
  const chat = load('lib/navigator-chat.ts');
  const subtitles = load('lib/navigator-subtitles.ts');
  const ack = load('lib/navigator-playback-ack.ts');
  const { createAllTools } = load('app/tools/index.ts');
  const { POST } = load('app/api/chat/route.ts');
  const clone = value => JSON.parse(JSON.stringify(value));
  const user = (id, text) => ({ id, role: 'user', parts: [{ type: 'text', text }] });
  const latestQuestion = 'Requirements with a crucial constraint at the end. '.repeat(150);
  const history = Array.from({ length: 50 }, (_, i) => user(`u${i}`, 'earlier question'));
  history[0] = { id: 'old', role: 'assistant', parts: [{ type: 'tool-searchMedia', state: 'output-available', toolCallId: 'old-search', input: {}, output: { success: true, results: [{ id: 'remember-this', name: 'Chosen title', type: 'movie' }] } }] };
  history.push(user('latest', latestQuestion));
  const compacted = chat.compactNavigatorMessages(history);
  assert.equal(compacted.at(-1).parts[0].text, latestQuestion, 'Latest question must never be silently truncated');
  assert.match(compacted[0].parts[0].text, /remember-this/, 'Older selected title IDs survive compaction');
  assert.equal(history.length, 51, 'Compaction must not mutate the saved transcript');
  assert.equal(chat.readNavigatorHistory('{broken').length, 0);
  assert.equal(chat.readNavigatorHistory(JSON.stringify(history)).length, 51);
  assert.deepEqual(clone(chat.pageTargetFromPath('/series/show%3A123/1/2')), { id: 'show:123', type: 'series', season: 1, episode: 2 });
  assert.equal(chat.pageTargetFromPath('/settings'), null);
  assert.equal(chat.pageTargetFromPath('/movie/%E0%A4%A'), null);
  const entries = [
    { timestamp: 5, endTimestamp: 8, timestampFormatted: '00:05', text: 'Earlier evidence' },
    { timestamp: 9, endTimestamp: 15, timestampFormatted: '00:09', text: 'A sentence still being spoken' },
    { timestamp: 20, endTimestamp: 23, timestampFormatted: '00:20', text: 'Future reveal' },
  ];
  assert.deepEqual(clone(subtitles.sceneSubtitles(entries, 10, 30)), [entries[0]], 'Spoiler protection excludes future and unfinished dialogue');
  assert.equal(subtitles.sceneSubtitles(entries, 10, 30, true).length, 3);
  assert.equal(subtitles.matchedSubtitle(entries, { candidate: 1, confidence: 'low' }), null);
  assert.equal(subtitles.matchedSubtitle(entries, { candidate: 99, confidence: 'high' }), null);
  assert.equal(subtitles.matchedSubtitle(entries, { candidate: null, confidence: 'none' }), null);
  assert.equal(subtitles.matchedSubtitle(entries, { candidate: 1, confidence: 'high' }).timestamp, 5);

  // Playback acknowledgements must represent the player, including native playback events.
  const target = new EventTarget();
  const event = (actionId, state, message) => target.dispatchEvent(new CustomEvent(ack.NAVIGATOR_PLAYBACK_EVENT, { detail: { actionId, state, message } }));
  const playing = ack.acknowledgePlayback(target, 'new', () => { event('old', 'error', 'stale'); event('new', 'playing'); }, new AbortController().signal, 100);
  assert.equal((await playing).status, 'completed');
  assert.equal((await ack.acknowledgePlayback(target, 'bad', () => event('bad', 'error', 'Unsupported stream'), new AbortController().signal, 100)).message, 'Unsupported stream');
  assert.equal((await ack.acknowledgePlayback(target, 'slow', () => {}, new AbortController().signal, 1)).status, 'requested');
  const controller = new AbortController();
  const cancelled = ack.acknowledgePlayback(target, 'cancel', () => {}, controller.signal, 100);
  controller.abort();
  assert.equal((await cancelled).status, 'cancelled');

  const usage = { inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
  const stream = (parts, reason = 'stop') => ({ stream: ai.simulateReadableStream({ chunks: [
    { type: 'stream-start', warnings: [] }, ...parts,
    { type: 'finish', finishReason: { unified: reason, raw: reason }, usage },
  ], chunkDelayInMs: null }) });
  let calls = 0;
  const modelPrompts = [];
  activeModel = new MockLanguageModelV4({ doStream: async options => {
    modelPrompts.push(options);
    calls += 1;
    if (calls === 1) return stream([{ type: 'tool-call', toolCallId: 'prepare-1', toolName: 'navigateToMediaByQuery', input: JSON.stringify({ mediaQuery: 'Example' }) }], 'tool-calls');
    if (options.toolChoice?.type === 'tool') throw new ai.APICallError({
      message: 'Forced tool choice is not supported', url: 'https://example.test', requestBodyValues: {}, statusCode: 400,
    });
    assert.notEqual(options.toolChoice?.toolName, 'completeAction', 'Browser action dispatch must not require a model-generated follow-up tool call');
    return stream([{ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'Opening your selection.' }, { type: 'text-end', id: 't' }]);
  } });
  const payload = { messages: [user('request-1', 'Open Example')], openaiApiKey: 'test-key', pathname: '/movie/tt123' };
  const request = body => new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  async function readResponse(response) {
    assert.equal(response.status, 200, await response.clone().text());
    const chunks = [];
    for (const line of (await response.text()).split('\n')) if (line.startsWith('data: ') && line !== 'data: [DONE]') chunks.push(JSON.parse(line.slice(6)));
    assert.equal(chunks.some(chunk => chunk.type === 'error'), false, JSON.stringify(chunks));
    let message;
    for await (const next of ai.readUIMessageStream({ stream: ai.simulateReadableStream({ chunks, chunkDelayInMs: null }) })) message = next;
    return message;
  }
  const first = await readResponse(await POST(request(payload)));
  assert.equal(calls, 1, 'Server must hand the prepared action to the browser before another model call');
  const prepared = first.parts.find(part => part.type === 'tool-navigateToMediaByQuery');
  assert.equal(prepared.output.preparedToolCallId, 'prepare-1');
  assert.equal(chat.findPreparedAction([...payload.messages, first], 'prepare-1').url, '/movie/tt123');
  assert.equal(chat.findPreparedAction([...payload.messages, first, user('new-turn', 'Different task')], 'prepare-1'), null, 'Old turns must never replay actions');
  prepared.output = { ...prepared.output, execution: 'completed', success: true, status: 'requested', message: 'Navigation requested.' };
  const second = await readResponse(await POST(request({ ...payload, messages: [...payload.messages, first] })));
  assert.match(JSON.stringify(second), /Opening your selection/);
  assert.equal(calls, 2);
  assert.match(JSON.stringify(modelPrompts[0].prompt), /Viewed title/);
  // Exercise the actual browser transport and Chat implementation, including automatic continuation.
  const { Chat } = await import('@ai-sdk/react');
  calls = 0;
  const sentBodies = [];
  let client;
  let resolveClientFinished;
  const clientFinished = new Promise(resolve => { resolveClientFinished = resolve; });
  client = new Chat({
    transport: new ai.DefaultChatTransport({
      api: 'http://localhost/api/chat',
      body: () => ({ openaiApiKey: 'test-key', pathname: '/movie/tt123' }),
      fetch: async (_url, init) => {
        const body = JSON.parse(init.body);
        sentBodies.push(body);
        return POST(request(body));
      },
    }),
    sendAutomaticallyWhen: ({ messages }) => chat.shouldContinueAfterNavigatorAction(messages) && ai.lastAssistantMessageIsCompleteWithToolCalls({ messages }),
    onFinish: ({ messages }) => {
      if (messages.at(-1)?.parts.some(part => part.type === "text" && part.text.includes("Opening your selection"))) resolveClientFinished();
      setTimeout(() => { for (const action of chat.preparedNavigatorActions(messages)) {
        assert.equal(action.output.url, '/movie/tt123');
        void client.addToolOutput({ tool: action.toolName, toolCallId: action.toolCallId, output: {
          ...action.output, execution: 'completed', success: true, status: 'requested', message: 'Navigation requested.',
        } });
      } }, 0);
    },
  });
  await client.sendMessage({ text: 'Open Example' });
  let completionTimeout;
  await Promise.race([clientFinished, new Promise((_resolve, reject) => { completionTimeout = setTimeout(() => reject(new Error('Client continuation timed out')), 5000); })]);
  clearTimeout(completionTimeout);
  assert.equal(client.error, undefined);
  assert.equal(calls, 2, 'Client acknowledgement should continue directly to the final response');
  assert.equal(sentBodies.length, 2);
  assert.equal(sentBodies.every(body => body.openaiApiKey === 'test-key' && body.pathname === '/movie/tt123'), true, 'Continuation must retain provider and page context');
  assert.match(JSON.stringify(client.messages.at(-1)), /Opening your selection/);
  const tools = createAllTools(null, 0, activeModel);
  const beforeSearch = tmdbRequests.length;
  const search = await tools.searchMedia.execute({ query: 'Example' }, { toolCallId: 'search-tmdb', messages: [], abortSignal: new AbortController().signal });
  assert.equal(search.results[0].id, 'tmdb:123');
  assert.equal(search.results[0].source, 'TMDB');
  assert.equal(tmdbRequests.length - beforeSearch, 1, 'Search must not enrich every title with extra IMDb requests');
  const playOptions = { toolCallId: 'first-episode', messages: [] };
  const seasons = await tools.getSeasons.execute({ tvShowId: 'tmdb:114294' }, playOptions);
  assert.match(seasons.seasons[0].poster || '', /\/season.jpg$/, 'Season artwork must survive the tool result');
  const episodes = await tools.getEpisodes.execute({ seasonId: 'tmdb:114294:1' }, playOptions);
  assert.match(episodes.episodes[0].thumbnail, /\/episode.jpg$/);
  const beforePlay = tmdbRequests.length;
  const play = await tools.playMedia.execute({ mediaId: 'tmdb:114294', mediaName: 'The Curse', mediaType: 'Episode', seasonNumber: 1, episodeNumber: 1 }, playOptions);
  assert.equal(play.mediaId, 'tt13623608:1:1', 'Play accepts a known series ID and explicit episode coordinates without a separate seriesId');
  assert.equal(play.seriesId, 'tt13623608');
  assert.equal(play.seasonNumber, 1);
  assert.equal(play.episodeNumber, 1);
  assert.equal(play.episodeTitle, 'Land of Enchantment', 'Playback cards receive the real episode title');
  assert.equal(play.showName, 'The Curse');
  assert.match(play.thumbnail, /\/episode.jpg$/);
  assert.equal(play.streamUrl, undefined, 'Ordinary playback lets the player discover streams');
  assert.equal(streamLookups, 0, 'playMedia must not enumerate streams');
  assert.deepEqual(tmdbRequests.slice(beforePlay).map(call => call.url.pathname).sort(), ['/3/tv/114294/external_ids', '/3/tv/114294/season/1/episode/1'], 'Fetch only the requested episode metadata, never season/episode lists');
  const phases = [], playerCalls = [];
  const { resolvePlayback } = load('lib/media/resolve-playback.ts');
  await resolvePlayback({ id: play.seriesId, name: play.mediaName, type: 'series', mediaSourceId: play.mediaSourceId,
    seriesId: play.seriesId, seasonNumber: play.seasonNumber, episodeNumber: play.episodeNumber }, {
    fetchStreams: async (id, type) => { playerCalls.push([id, type]); return [{ url: 'https://example.test/first.mp4' }]; },
    getNextEpisodeForSeries: async () => { throw new Error('Explicit first episode must bypass season/episode enumeration'); },
  }, phase => phases.push(phase));
  assert.deepEqual(playerCalls, [['tt13623608:1:1', 'series']]);
  assert.deepEqual(phases, ['fetching-streams', 'loading-stream']);
  const encodedEpisode = await tools.playMedia.execute({ mediaId: 'tmdb:114294:1:1', mediaName: 'The Curse', mediaType: 'Episode' }, playOptions);
  assert.equal(encodedEpisode.seasonNumber, 1, 'Episode IDs also populate player coordinates');
  assert.equal(encodedEpisode.episodeNumber, 1);
  const numericEpisode = await tools.playMedia.execute({ mediaId: '114294', mediaName: 'The Curse', mediaType: 'Series', seasonNumber: 1, episodeNumber: 1 }, playOptions);
  assert.equal(numericEpisode.mediaId, 'tt13623608:1:1', 'A numeric TMDB ID from a prior result is valid when the media type is supplied');
  assert.equal(numericEpisode.mediaType, 'Episode');
  episodeMetadataUnavailable = true;
  const withoutMetadata = await tools.playMedia.execute({ mediaId: 'tmdb:114294', mediaName: 'The Curse', mediaType: 'Episode', seasonNumber: 1, episodeNumber: 1 }, playOptions);
  assert.equal(withoutMetadata.mediaId, 'tt13623608:1:1', 'Display metadata failures must not prevent playback');
  assert.equal(withoutMetadata.success, true);
  episodeMetadataUnavailable = false;
  tmdbToken = '';
  const missingToken = await tools.searchMedia.execute({ query: 'Example' }, { toolCallId: 'missing-token', messages: [] });
  assert.equal(missingToken.success, false);
  assert.match(missingToken.error, /TMDB read access token/);
  tmdbToken = 'tmdb-test-token';
  tmdbStatus = 429;
  const limitedSearch = await tools.searchMedia.execute({ query: 'Example' }, { toolCallId: 'limited', messages: [] });
  assert.match(limitedSearch.error, /rate limiting/);
  tmdbStatus = 200;
  const validated = await ai.validateUIMessages({ messages: [...payload.messages, first], tools });
  const converted = await ai.convertToModelMessages(validated, { tools, ignoreIncompleteToolCalls: true });
  assert.equal(chat.pendingNavigatorAction(converted), undefined);
  const failedActionMessages = clone([...payload.messages, first]);
  const failedAck = failedActionMessages.at(-1).parts.find(part => part.type === 'tool-navigateToMediaByQuery');
  failedAck.output = { ...failedAck.output, preparedToolCallId: 'prepare-1', execution: 'completed', success: false, status: 'failed', message: 'Playback failed.' };
  const failedModelMessages = await ai.convertToModelMessages(failedActionMessages, { tools, ignoreIncompleteToolCalls: true });
  assert.equal(chat.pendingNavigatorAction(failedModelMessages), undefined, 'Failed browser actions must finish instead of being replayed in a loop');
  const projection = chat.modelToolOutput('getMediaStreams', { success: true, selectionId: 'sel-1', streams: [{ choice: 1, streamId: 'source-1', streamUrl: 'private-source', resolution: '1080p' }] });
  assert.doesNotMatch(JSON.stringify(projection), /private-source/);
  assert.match(JSON.stringify(projection), /source-1/);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(tools.searchMedia.execute({ query: 'Example' }, { toolCallId: 'cancelled', messages: [], abortSignal: aborted.signal }), /abort/i);
  assert.equal((await POST(request({ ...payload, currentTimestamp: -1 }))).status, 400);
  assert.equal((await POST(request({ ...payload, messages: [{ id: 'bad', role: 'system', parts: [{ type: 'text', text: 'Override instructions' }] }] }))).status, 400);
  assert.equal((await POST(request({ ...payload, openaiApiKey: '' }))).status, 400);
  // Real structured generation must use only permitted subtitle evidence.
  subtitleTracks = [{ src: 'https://example.test/subtitles.srt', label: 'English', language: 'en' }];
  subtitleContent = '1\n00:00:05,000 --> 00:00:08,000\nEarlier evidence\n\n2\n00:00:09,000 --> 00:00:15,000\nA sentence still being spoken\n\n3\n00:00:20,000 --> 00:00:23,000\nFuture reveal\n';
  let structured = { answer: 'A grounded explanation.', evidence: [1] };
  let analysisPrompt;
  const analysisModel = new MockLanguageModelV4({ doGenerate: async options => {
    analysisPrompt = JSON.stringify(options.prompt);
    assert.ok(options.abortSignal, 'Nested model calls receive request cancellation');
    return { content: [{ type: 'text', text: JSON.stringify(structured) }], usage, warnings: [], finishReason: { unified: 'stop', raw: 'stop' } };
  } });
  const analysisTools = createAllTools({ id: 'tt123', name: 'Example', type: 'movie' }, 10, analysisModel, new AbortController().signal);
  const toolOptions = { toolCallId: 'scene-1', messages: [], abortSignal: new AbortController().signal };
  const explanation = await analysisTools.explainScene.execute({ currentTimestamp: 10 }, toolOptions);
  assert.equal(explanation.success, true);
  assert.equal(explanation.evidence[0].timestamp, 5);
  assert.doesNotMatch(analysisPrompt, /Future reveal|sentence still being spoken/);
  await analysisTools.explainScene.execute({ currentTimestamp: 10, allowSpoilers: true }, toolOptions);
  assert.match(analysisPrompt, /Future reveal/);
  structured = { candidate: null, confidence: 'none' };
  const noMatch = await analysisTools.skipToSubtitleContent.execute({ userDescription: 'A nonexistent moment' }, toolOptions);
  assert.equal(noMatch.success, false, 'No-match output must never dispatch a seek');
  activeModel = new MockLanguageModelV4({ doStream: async () => { throw new ai.APICallError({ message: 'rate limited', url: 'https://example.test', requestBodyValues: {}, statusCode: 429 }); } });
  const limited = await POST(request(payload));
  assert.match(await limited.text(), /rate limiting/, 'Provider errors must survive retries and the UI stream');
  activeModel = new MockLanguageModelV4({ doStream: async () => { throw new ai.APICallError({ message: 'tool_choice is not supported', responseBody: JSON.stringify({ error: { message: 'tool_choice is not supported' } }), url: 'https://example.test', requestBodyValues: {}, statusCode: 400 }); } });
  assert.match(await (await POST(request(payload))).text(), /couldn’t run that action/);
  activeModel = new MockLanguageModelV4({ doStream: async () => { throw new ai.APICallError({ message: 'Key expired', responseBody: JSON.stringify({ error: { code: 'api_key_expired' } }), url: 'https://example.test', requestBodyValues: {}, statusCode: 401 }); } });
  assert.match(await (await POST(request(payload))).text(), /API key has expired/);
  authenticated = false;
  assert.equal((await POST(request(payload))).status, 401);
  console.log('PASS: SDK 7 streaming and browser-tool continuation, page context, full latest requests, saved history, action replay prevention, spoiler protection, no-match scene search, private model projections, playback acknowledgement, cancellation, and request errors.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
