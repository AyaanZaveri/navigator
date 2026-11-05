const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../lib/navigator-selection.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(js, { module: mod, exports: mod.exports });
const { selectMediaResults, successfulMediaResults, seedMediaResults, rememberMediaResults } = mod.exports;
const store = new Map([['a', { id: 'a', title: 'A' }], ['b', { id: 'b', title: 'B' }]]);
const chosen = selectMediaResults(['b', 'a', 'b'], store, 'Picks');
assert.equal(chosen.success, true);
assert.deepEqual(Array.from(chosen.results, x => x.id), ['b', 'a']);
assert.equal(selectMediaResults(['a', 'missing'], store).success, false);
assert.equal(successfulMediaResults({ success: false, results: [{ id: 'x' }] }).length, 0);
assert.equal(successfulMediaResults({ success: true, results: [{ id: 'x' }] }).length, 1);
const historyStore = new Map();
const part = (name, success, id, state = 'output-available') => ({ type: `tool-${name}`, state, output: { success, results: [{ id, name: id }] } });
seedMediaResults(historyStore, [part('searchMedia', true, 'movie'), part('getFilmography', true, 'credit'),
    part('searchPeople', true, 'person'), part('searchMediaWeb', true, 'web'), part('searchMedia', false, 'failed'),
    part('searchMedia', true, 'pending', 'input-available'),
    { type: 'dynamic-tool', toolName: 'getEpisodes', state: 'output-available', output: { success: true, episodes: [{ id: 'episode' }] } }]);
assert.deepEqual([...historyStore.keys()], ['movie', 'credit', 'episode'], 'Only completed successful media retrievals can seed selection history');
assert.deepEqual(Array.from(selectMediaResults(['credit', 'movie'], historyStore).results, x => x.id), ['credit', 'movie']);
const colliding = new Map();
rememberMediaResults(colliding, [{ id: 'tmdb:1', type: 'Movie', name: 'A film' }, { id: 'tmdb:1', type: 'Series', name: 'A show' }]);
assert.equal(selectMediaResults(['tmdb:1'], colliding).success, false, 'Do not silently choose a movie when a series shares its numeric identity');
assert.equal(selectMediaResults(['series:tmdb:1'], colliding).results[0].name, 'A show');
rememberMediaResults(colliding, [{ id: 'tmdb:1', type: 'Movie', name: 'A film' }]);
assert.equal(colliding.has('tmdb:1'), false, 'Later results do not reintroduce an ambiguous untyped alias');
assert.equal(selectMediaResults(['movie:tmdb:1', 'movie:tmdb:1'], colliding).results.length, 1);
const presentationModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/tools/presentation.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: presentationModule, exports: presentationModule.exports,
    require: name => name === 'ai' ? { tool: value => value } : name === '@/lib/navigator-selection' ? mod.exports : require(name) });
const definition = presentationModule.exports.createPresentMediaResults(historyStore);
for (const ids of [[], Array(41).fill('movie'), [''], ['movie', 123]]) assert.equal(definition.inputSchema.safeParse({ ids }).success, false);
assert.equal(definition.inputSchema.safeParse({ ids: ['movie'], heading: 'x'.repeat(101) }).success, false);
assert.equal(definition.inputSchema.safeParse({ ids: ['credit', 'movie'], heading: 'Known for' }).success, true);
const chatModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/navigator-chat.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: chatModule, exports: chatModule.exports });
const { markNavigatorRequestStopped, navigatorTurnContext, preparedNavigatorActions, shouldContinueAfterNavigatorAction, displayNavigatorText, readNavigatorHistory } = chatModule.exports;
const messages = [{ id: 'u', role: 'user', parts: [{ type: 'text', text: 'Research' }] },
    { id: 'a', role: 'assistant', parts: [{ type: 'tool-navigateToEpisode', toolCallId: 'n', state: 'output-available', output: { success: true, preparedToolCallId: 'n', execution: 'prepared' } }] }];
const stopped = markNavigatorRequestStopped(messages);
assert.equal(stopped[0].metadata.navigatorRequestState, 'cancelled');
assert.equal(messages[0].metadata, undefined, 'Stopping does not mutate a prior snapshot');
assert.equal(preparedNavigatorActions(stopped).length, 0, 'Cancelled requests cannot execute saved prepared actions');
assert.equal(shouldContinueAfterNavigatorAction(stopped), false);
assert.equal(navigatorTurnContext(readNavigatorHistory(JSON.stringify(stopped)), 1).cancelled, true, 'Cancelled state survives history reload');
const continued = [...stopped, { id: 'retry-user', role: 'user', parts: [] }, { id: 'retry-answer', role: 'assistant', parts: [] }];
assert.equal(navigatorTurnContext(continued, 3).cancelled, false, 'A new retry is not cancelled by a historical turn');
assert.equal(navigatorTurnContext(continued, 1).statusMessageId, 'a', 'Cancellation stays on its own turn');
assert.equal(displayNavigatorText('lookup for `tmdb:95396:99` returns not found.'), 'lookup for the requested title returns not found.');
assert.equal(displayNavigatorText('[Open](/api/navigator/title?id=tmdb:95396&season=1)'), '[Open](/api/navigator/title?id=tmdb:95396&season=1)', 'Never redact actionable URL identities');
console.log('navigator selection tests passed');
