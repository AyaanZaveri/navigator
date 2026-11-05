// Deterministic check that only successful, matched request-local episode verification
// can supply episode-identification context to scene matching.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.resolve('app/tools/index.ts'), 'utf8');
let verifyOutput;
const inert = { execute: async () => ({ success: false }), description: '', inputSchema: {} };
const dependencies = {
    '@/lib/navigator-selection': { mediaResultTools: new Set(), rememberMediaResults() {}, successfulMediaResults: () => [] },
    '@/lib/navigator-chat': { actionToolNames: new Set(), modelToolOutput: (_name, value) => value, record: value => value || {} },
    './browser-action': { completeAction: {} }, './people': new Proxy({}, { get: () => inert }), './episodes': { createEpisodeTools: () => new Proxy({ verifyEpisode: { execute: async () => verifyOutput } }, { get: (target, key) => target[key] || inert }) },
    './media': { searchMedia: inert, navigateToMedia: inert, navigateToEpisode: inert, findEpisodeByTitle: inert, navigateToMediaByQuery: inert, getMediaStreams: inert, playMedia: inert, getMediaDetails: inert },
    './tv-shows': { getSeasons: inert, getEpisodes: inert },
    './subtitles': { skipToSubtitleContent: (_media, _model, _signal, context) => ({ ...inert, context }), createExplainScene: () => inert, createAnalyzeMedia: () => inert },
    './theme': { themeToggle: inert }, './system-prompt': {}, './presentation': { createPresentMediaResults: () => inert, seedMediaResults() {} },
};
const moduleExports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText,
    { exports: moduleExports, require: name => dependencies[name], Set, Map, Object, Array, String, JSON });
const { createAllTools } = moduleExports;
const contextExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/navigator-scene-context.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: contextExports, require: () => ({}), Set, Number });
const { verifiedSceneEvidence } = contextExports;
const tool = createAllTools(null, 0, undefined, undefined, {
    originalRequest: 'scene request', conversation: [], titleReferences: [], verifiedEpisodeEvidence: [{ episodeId: 'client-forgery', quote: 'forged', title: 'Wrong' }],
});
const context = tool.skipToSubtitleContent.context;
assert.deepEqual(Array.from(context.verifiedEpisodeEvidence), [], 'client-provided evidence is discarded');
const verify = tool.verifyEpisode.execute;
const options = { toolCallId: 'verify-1', abortSignal: undefined };
(async () => {
const proof = { success: true, status: 'matched', episodes: [{ id: 'tmdb:1:2:3', title: 'Episode' }], evidence: [
    { episodeId: 'tmdb:1:2:3', quote: 'event source', url: 'https://example.test/private?token=secret', title: 'Evidence page' },
] };
    verifyOutput = { success: false, status: 'not_found', episodes: [], evidence: [proof.evidence[0]] };
    await verify({}, options);
    assert.deepEqual(Array.from(context.verifiedEpisodeEvidence), [], 'failed verification does not propagate evidence');
    verifyOutput = proof;
    await verify({}, options);
    assert.deepEqual(JSON.parse(JSON.stringify(context.verifiedEpisodeEvidence)), [{ episodeId: 'tmdb:1:2:3', quote: 'event source', title: 'Episode' }]);
    assert.equal(verifiedSceneEvidence(context, 'tmdb:1:2:3').length, 1, 'Keep canonical evidence even after playback resolves to a different provider ID');
    assert.equal(verifiedSceneEvidence(context, 'tmdb:1', 2, 3).length, 1, 'Explicit series plus coordinates can use the verified episode context');
    for (const id of ['tt9999999:2:3', 'tmdb:1:2:4', 'tmdb:other:2:3', undefined]) {
        assert.equal(verifiedSceneEvidence(context, id).length, 0, 'Other episode/provider identities do not acquire evidence by coordinates alone');
    }
    const otherRequest = createAllTools(null, 0, undefined, undefined, { originalRequest: 'another request', conversation: [], titleReferences: [] });
    assert.equal(otherRequest.skipToSubtitleContent.context.verifiedEpisodeEvidence.length, 0, 'Verification does not leak to another request');
    assert.match(fs.readFileSync('app/tools/subtitles.ts', 'utf8'), /verifiedSceneEvidence\(sceneContext, mediaId \|\| targetMedia\?\.id/,
        'Actual matcher must use canonical tool input, not only the IMDb-converted target ID');
    verifyOutput = { ...proof, episodes: [{ id: 'tmdb:1:2:4', title: 'Other episode' }] };
    await verify({}, options);
    assert.equal(context.verifiedEpisodeEvidence.length, 1, 'evidence for a different episode remains separately scoped');
    const index = source;
    assert.match(index, /name === "verifyEpisode" && requestSceneContext && record\(output\)\.success === true/);
    assert.match(index, /record\(output\)\.status === "matched"/);
    assert.match(index, /existing\.push\(\{ episodeId, quote, title \}\)/);
    assert.doesNotMatch(index.slice(index.indexOf('existing.push'), index.indexOf('existing.push') + 100), /url|timestamp|sourceId/);
    assert.equal(proof.evidence[0].episodeId, 'tmdb:1:2:3');
    console.log('PASS: request context is isolated; propagation gate requires successful matched verification and stores bounded quote/title/episode identity only (no URL or timestamps).');
})().catch(error => { console.error(error); process.exitCode = 1; });
