const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const widgets = {};
let prefersReducedMotion = false;
function widget(name) { const Component = () => null; widgets[name] = Component; return Component; }
const cardModules = {
    'framer-motion': { motion: { div: widget('reveal') }, useReducedMotion: () => prefersReducedMotion },
    '@/components/arc/lib/motion-tokens': load('components/arc/motion-tokens.ts', {}),
    './result-card-motion': load('components/navigator/result-card-motion.ts', {}),
    '@/components/ui/button': { Button: widget('button') },
    '@/components/arc/accordion/accordion': { Accordion: widget('accordion') },
    './media-link-card': { MediaLinkCard: widget('media') },
    './media-details-card': { MediaDetailsCard: widget('details') },
    './season-card': { SeasonCard: widget('season') },
    './stream-list-card': { StreamListCard: widget('streams') },
    './navigation-card': { NavigationCard: widget('navigation') },
    './play-media-card': { PlayMediaCard: widget('playback') },
    './theme-toggle-card': { ThemeToggleCard: widget('theme') },
    './subtitle-skip-card': { SubtitleSkipCard: widget('seek') },
    './scene-explain-card': { SceneExplainCard: widget('scene') },
    './media-analysis-card': { MediaAnalysisCard: widget('analysis') },
    './person-card': { PersonCard: widget('person') },
};
function load(file, dependencies) {
    const context = { exports: {}, URLSearchParams, require: name => dependencies[name] || require(name) };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, context, { filename: file });
    return context.exports;
}
const chat = load('lib/navigator-chat.ts', {});
const timing = load('lib/navigator-timing.ts', { './navigator-chat': chat });
const timedUser = { id: 'timed-user', role: 'user', parts: [{ type: 'text', text: 'Play a show' }] };
const timedLookup = { id: 'timed-lookup', role: 'assistant', parts: [{ type: 'text', text: 'Finding the show' }] };
const timedAnswer = { id: 'timed-answer', role: 'assistant', parts: [{ type: 'text', text: 'Playing the show' }] };
const timingResult = timing.navigatorResponseDurations([timedUser, timedLookup, timedAnswer], { 'timed-user': 7123 });
assert.equal(timingResult['timed-answer'], 7.123);
assert.equal(timingResult['timed-lookup'], undefined, 'Only the final reply gets a completion timer');
assert.equal(timing.isNavigatorRequestComplete([timedUser, timedAnswer]), true);
for (const output of [
    { success: true, execution: 'prepared', preparedToolCallId: 'play-1' },
    { success: true, execution: 'completed', status: 'requested', preparedToolCallId: 'play-1' },
    { success: false, execution: 'completed', status: 'failed', preparedToolCallId: 'play-1' },
]) {
    assert.equal(timing.isNavigatorRequestComplete([timedUser, { ...timedAnswer, parts: [{ type: 'tool-playMedia', state: 'output-available', output }] }]), false, 'Pending, unconfirmed, and failed actions must not say Done');
}
assert.equal(timing.isNavigatorRequestComplete([timedUser, { ...timedAnswer, parts: [{ type: 'tool-playMedia', state: 'output-available', output: { success: true, execution: 'completed', status: 'completed', preparedToolCallId: 'play-1' } }] }]), true);
const nextTimedUser = { ...timedUser, id: 'next-user' };
const nextTimedAnswer = { ...timedAnswer, id: 'next-answer' };
const twoTimers = timing.navigatorResponseDurations([timedUser, timedAnswer, nextTimedUser, nextTimedAnswer], { 'timed-user': 7123, 'next-user': 1100 });
assert.equal(twoTimers['timed-answer'], 7.123);
assert.equal(twoTimers['next-answer'], 1.1);
for (const greeting of ['hi', 'Hello!', 'hey there', 'Good morning']) {
    const user = { ...timedUser, parts: [{ type: 'text', text: greeting }] };
    assert.equal(timing.navigatorResponseDurations([user, timedAnswer], { 'timed-user': 4000 })['timed-answer'], 4, 'Greetings retain completion timers for speed comparisons');
}
const greetingWithRequest = { ...timedUser, parts: [{ type: 'text', text: 'Hi, play The Curse' }] };
assert.equal(timing.navigatorResponseDurations([greetingWithRequest, timedAnswer], { 'timed-user': 4000 })['timed-answer'], 4, 'A greeting before a real request must retain its timer');
// Render the actual transcript with short content. It must remain scrollable
// when a child later expands without changing the messages prop.
let focusHookIndex = 0;
const focusReact = require('react');
const { NavigatorFocus } = load('components/navigator/focus.tsx', {
    react: { ...focusReact, useState: value => [focusHookIndex++ === 0 ? 'open' : value, () => {}],
        useRef: value => ({ current: value }), useCallback: value => value, useEffect: () => {}, useLayoutEffect: () => {} },
    'framer-motion': { motion: { div: 'div', section: 'section', span: 'span' }, AnimatePresence: 'div', LayoutGroup: 'div', useReducedMotion: () => true },
    'border-beam': { BorderBeam: 'div' }, streamdown: { Streamdown: 'div' },
    'next-themes': { useTheme: () => ({ resolvedTheme: 'dark' }) },
    './focus-ui/button': { Button: 'button' }, './focus-ui/kbd': { Kbd: 'kbd', KbdGroup: 'span' },
    './focus-ui/input-group': { InputGroup: 'div', InputGroupAddon: 'div', InputGroupButton: 'button', InputGroupInput: 'input' },
    './activity-status': { NavigatorActivityStatus: 'span' }, './focus-results': {}, './focus.css': {},
    '@/lib/navigator-activity-label': { getNavigatorActivityLabel: () => '', NAVIGATOR_ACTIVITY_VARIANT_COUNT: 1 },
    '@/lib/navigator-beam': { navigatorBeamColors: {} }, '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
});
const focusTree = NavigatorFocus({ open: true, showLauncher: true, messages: [{ id: 'user', role: 'user', parts: [{ type: 'text', text: 'Play a show' }] }], input: '', isBusy: false, responseDurations: {} });
function findTranscript(node) {
    if (!node || typeof node !== 'object') return undefined;
    if (node.props?.onScroll) return node;
    for (const child of focusReact.Children.toArray(node.props?.children)) {
        const found = findTranscript(child);
        if (found) return found;
    }
}
const transcript = findTranscript(focusTree);
assert.ok(transcript, 'Inspect the rendered transcript, not an unrelated wrapper');
assert.equal(transcript.props.style.overflowY, 'auto', 'A child accordion must be able to create scroll overflow without new messages');

const { toNavigatorSegments } = load('components/navigator/focus-results.tsx', { ...cardModules, '@/lib/navigator-chat': chat });

// Long discovery lists retain every candidate while showing only a compact preview.
let resultsExpanded = false;
const React = require('react');
const presentation = load('components/navigator/focus-results.tsx', {
    ...cardModules, '@/lib/navigator-chat': chat,
    react: { ...React, useId: () => 'result-list', useState: () => [resultsExpanded, update => { resultsExpanded = update(resultsExpanded); }] },
});
const credits = { type: 'tool-getFilmography', state: 'output-available', input: {}, output: {
    success: true, results: Array.from({ length: 39 }, (_, index) => ({ id: String(index), name: `Title ${index}` })),
} };
const browsing = presentation.toNavigatorSegments([credits]);
const allCards = browsing.find(segment => segment.kind === 'results').results.cards;
assert.equal(allCards.length, 39, 'Presentation must not remove candidates from tool output');
let preview = presentation.NavigatorResultCards({ cards: allCards });
assert.equal(preview.props.children[0].props.children.length, 5);
assert.equal(preview.props.children[0].props.children[0].props.initial, false, 'The initial preview appears immediately');
assert.equal(preview.props.children[0].props.children[0].props.animate.opacity, 1);
const previewKey = preview.props.children[0].props.children[0].key;
let expandButton = preview.props.children[1].props.children;
assert.equal(expandButton.props.children, 'Show 34 more results');
assert.equal(expandButton.props['aria-expanded'], false);
assert.equal(expandButton.props['aria-controls'], preview.props.children[0].props.id);
expandButton.props.onClick();
preview = presentation.NavigatorResultCards({ cards: allCards });
assert.equal(preview.props.children[0].props.children.length, 39);
assert.equal(preview.props.children[0].props.children[0].key, previewKey, 'Existing cards keep their identity when expanding');
assert.equal(preview.props.children[0].props.children[5].props.initial.opacity, 0, 'Only newly revealed cards get a mount entrance');
assert.equal(preview.props.children[0].props.children[5].props.initial.transform, 'translateY(4px)');
assert.equal(preview.props.children[0].props.children[5].props.transition.duration, 0.15);
assert.equal(preview.props.children[0].props.children[5].props.transition.delay, undefined, 'Long lists must never wait for a stagger');
assert.equal(preview.props.children[1].props.children.props['aria-expanded'], true);
preview.props.children[1].props.children.props.onClick();
assert.equal(presentation.NavigatorResultCards({ cards: allCards }).props.children[0].props.children.length, 5);
assert.equal(presentation.NavigatorResultCards({ cards: allCards.slice(0, 5) }).props.children[1], false);
const closedPreview = presentation.NavigatorResultCards({ cards: allCards, revealed: false });
assert.equal(closedPreview.props.children[0].props.children[0].props.animate.opacity, 0, 'Closed accordions hold their reveal until opened');
prefersReducedMotion = true;
resultsExpanded = true;
const reducedPreview = presentation.NavigatorResultCards({ cards: allCards });
assert.equal(reducedPreview.props.children[0].props.children[5].props.initial.transform, 'none');
assert.equal(reducedPreview.props.children[0].props.children[5].props.animate.transform, 'none');
assert.equal(reducedPreview.props.children[0].props.children[5].props.initial.opacity, 0, 'Reduced motion keeps the fade');
prefersReducedMotion = false;
resultsExpanded = false;
const playbackLookup = presentation.toNavigatorSegments([credits], { playbackRequest: true });
for (const count of [1, 2, 3, 4, 5, 10, 20]) {
    const lookup = { ...credits, output: { ...credits.output, results: credits.output.results.slice(0, count) } };
    const playback = presentation.toNavigatorSegments([lookup], { playbackRequest: true });
    assert.equal(playback.some(segment => segment.kind === 'lookup'), count > 3, `Playback lookup with ${count} results uses the three-card cutoff`);
    if (count <= 3) assert.equal(playback.find(segment => segment.kind === 'results').results.cards.length, count);
    const browse = presentation.toNavigatorSegments([lookup]);
    assert.equal(browse.some(segment => segment.kind === 'lookup'), false, 'Explicit browsing keeps the direct preview');
}
const personLookup = presentation.toNavigatorSegments([{ type: 'tool-searchPeople', state: 'output-available', input: {}, output: { success: true, results: [{ id: 1, name: 'Nathan Fielder' }] } }], { playbackRequest: true });
assert.equal(personLookup.some(segment => segment.kind === 'lookup'), false, 'A single person match needs no accordion');
assert.equal(personLookup.find(segment => segment.kind === 'results').results.cards[0].type, widgets.person);
const detailLookup = presentation.toNavigatorSegments([{ type: 'tool-getPersonDetails', state: 'output-available', input: {}, output: { success: true, person: { id: 1, name: 'Nathan Fielder' } } }], { playbackRequest: true });
assert.equal(detailLookup.find(segment => segment.kind === 'results').results.cards.type, widgets.person, 'Single detail cards also stay visible');
assert.equal(playbackLookup.length, 1, 'Playback research replaces the trace and cards with a single disclosure');
assert.equal(playbackLookup[0].kind, 'lookup');
assert.match(playbackLookup[0].trace.label, /39 results/);
const disclosure = presentation.NavigatorLookup(playbackLookup[0]);
assert.equal(disclosure.type, widgets.accordion, 'Use the UI Arc accordion for lookup disclosures');
assert.equal(disclosure.props.defaultOpen, -1, 'Research starts collapsed before playback resolves');
assert.equal(disclosure.props.items[0].title, playbackLookup[0].trace.label);
assert.equal(disclosure.props.items[0].content.props.cards.length, 39, 'The panel retains the complete expandable result list');
assert.equal(disclosure.props.size, 'sm', 'Lookup accordions use the compact borderless variant');
const pendingLookup = presentation.toNavigatorSegments([{ ...credits, state: 'input-available', output: undefined }], { playbackRequest: true });
assert.equal(pendingLookup[0].trace.phase, 'running');
const failedLookup = presentation.toNavigatorSegments([{ ...credits, output: { success: false, error: 'Lookup failed' } }], { playbackRequest: true });
assert.equal(failedLookup[0].kind, 'trace');
assert.equal(failedLookup[0].trace.phase, 'error', 'Lookup errors must remain visible');
const playTool = { type: 'tool-playMedia', state: 'output-available', input: {}, output: { success: true, mediaId: 'example', mediaType: 'Movie' } };
const playbackSegments = presentation.toNavigatorSegments([credits, playTool]);
assert.equal(playbackSegments[0].kind, 'lookup');
assert.equal(playbackSegments.find(segment => segment.kind === 'results').results.cards.type, widgets.playback, 'The chosen playback card stays visible');
assert.equal(presentation.isPlaybackRequest('please play the first episode'), true);
assert.equal(presentation.isPlaybackRequest('Can you watch The Curse'), true);
assert.equal(presentation.isPlaybackRequest('Show me movies to watch'), false);
assert.equal(presentation.isPlaybackRequest("Don't play anything"), false);
const preparedTheme = {
    type: 'tool-themeToggle', state: 'output-available', toolCallId: 'theme-1', input: { action: 'light' },
    output: { success: true, action: 'setTheme', theme: 'light', preparedToolCallId: 'theme-1', execution: 'prepared' },
};
assert.equal(toNavigatorSegments([preparedTheme]).length, 0, 'Prepared actions must never show readiness text, success rows, or premature controls');
const appliedTheme = { ...preparedTheme, output: { ...preparedTheme.output, execution: 'completed', status: 'completed', message: 'Theme changed to light.' } };
const answer = { type: 'text', text: 'Switched to light mode.' };
const theme = toNavigatorSegments([appliedTheme, answer]);
assert.equal(theme.filter(segment => segment.kind === 'results').length, 1, 'Theme changes restore exactly one theme widget');
assert.equal(theme.find(segment => segment.kind === 'results').results.cards.type, widgets.theme);
assert.equal(theme.filter(segment => segment.kind === 'trace').length, 0, 'Theme changes have no extra status or play-icon row');
assert.equal(theme.filter(segment => segment.kind === 'text').length, 1, 'The assistant gives one confirmation');
assert.equal(toNavigatorSegments([appliedTheme]).filter(segment => segment.kind === 'text').length, 0, 'The theme widget is sufficient for a tool-only reply');
const legacy = { type: 'tool-completeAction', state: 'output-available', input: { preparedToolCallId: 'theme-1' }, output: { preparedToolCallId: 'theme-1', success: true, status: 'completed', message: 'Theme changed to light.' } };
const legacySegments = toNavigatorSegments([{ ...preparedTheme, output: { ...preparedTheme.output, message: 'Ready to apply your request.' } }, legacy, answer]);
assert.equal(legacySegments.filter(segment => segment.kind === 'results').length, 1, 'Saved chats with the older handoff also regain the widget');
assert.equal(legacySegments.filter(segment => segment.kind === 'trace').length, 0);
const legacyError = toNavigatorSegments([preparedTheme, { ...legacy, state: 'output-error', output: undefined, errorText: 'The app could not apply this change.' }]);
assert.equal(legacyError.length, 1);
assert.equal(legacyError[0].trace.phase, 'error');
assert.doesNotMatch(JSON.stringify(legacySegments), /Ready to apply|Theme change ready|Title ready/);
const navigation = { type: 'tool-navigateToMediaByQuery', state: 'output-available', toolCallId: 'nav-1', input: {}, output: { success: true, action: 'navigate', preparedToolCallId: 'nav-1', execution: 'prepared', url: '/movie/tt123', mediaName: 'Example' } };
const navigationSegments = toNavigatorSegments([navigation]);
assert.equal(navigationSegments.filter(segment => segment.kind === 'results').length, 1, 'Selected-title cards remain visible');
assert.equal(navigationSegments.filter(segment => segment.kind === 'trace').length, 0);
assert.equal(navigationSegments.filter(segment => segment.kind === 'text').length, 0);
const failedTheme = { ...appliedTheme, output: { ...appliedTheme.output, success: false, message: 'Could not change the theme.' } };
const failed = toNavigatorSegments([failedTheme]);
assert.equal(failed.length, 1);
assert.equal(failed[0].trace.phase, 'error');
assert.equal(failed[0].trace.label, 'Could not change the theme.');

const episodeResults = toNavigatorSegments([{ type: 'tool-getEpisodes', state: 'output-available', toolCallId: 'episodes-1', input: {},
    output: { success: true, source: 'TMDB', episodes: [{ id: 'tmdb:114294:1:1', name: 'Premiere', seasonNumber: 1, episodeNumber: 1, thumbnail: 'https://image.tmdb.org/t/p/w500/still.jpg' }] } }]);
const episodeItem = episodeResults.find(segment => segment.kind === 'results').results.cards[0].props.item;
assert.equal(episodeItem.source, 'TMDB', 'Episode cards retain the tool-level artwork source');
const fakeResult = widget('artwork-result');
const resultDependencies = { './result-card': { ResultCard: fakeResult, ResultBadge: widget('badge'), ResultMeta: widget('meta'), formatCardRuntime: () => '' } };
const { MediaLinkCard } = load('components/navigator/media-link-card.tsx', {
    ...resultDependencies,
    '@/lib/artwork': { artworkFromPath: () => undefined },
    '@/lib/navigator-title-path': { navigatorTitlePath: () => '/api/navigator/title?id=tmdb:114294&season=1&episode=1' },
    '../icons/rotten-tomatoes': { RottenTomatoesIcon: widget('rating') },
});
const episodeCard = MediaLinkCard({ item: episodeItem });
assert.equal(episodeCard.props.image, episodeItem.thumbnail, 'TMDB redirect routes must not discard supplied episode stills');
assert.equal(episodeCard.props.imageAspect, 'landscape');
const { SeasonCard } = load('components/navigator/season-card.tsx', {
    ...resultDependencies, '@/lib/navigator-title-path': { navigatorTitlePath: () => '/series/example/1/1' },
});
const seasonCard = SeasonCard({ season: { id: 'tmdb:114294:1', name: 'Season 1', poster: 'https://image.tmdb.org/t/p/w500/season.jpg' } });
assert.match(seasonCard.props.image, /season.jpg$/, 'Season cards render the supplied portrait poster');
const { PlayMediaCard } = load('components/navigator/play-media-card.tsx', {
    ...resultDependencies,
    '@/lib/artwork': load('lib/artwork.ts', {}),
    '@/lib/series-route': load('lib/series-route.ts', {}),
    '@/lib/navigator-title-path': load('lib/navigator-title-path.ts', { '@/lib/series-route': load('lib/series-route.ts', {}) }),
});
const playbackCard = PlayMediaCard({ result: { success: true, mediaId: 'tt13623608:1:1', mediaName: 'The Curse', showName: 'The Curse', episodeTitle: 'Land of Enchantment', mediaType: 'Episode', seasonNumber: 1, episodeNumber: 1 } });
const playbackImage = new URL(playbackCard.props.image, 'http://localhost');
assert.equal(playbackImage.pathname, '/api/artwork');
assert.equal(playbackImage.searchParams.get('id'), 'tt13623608');
assert.equal(playbackImage.searchParams.get('kind'), 'still');
assert.equal(playbackImage.searchParams.get('season'), '1');
assert.equal(playbackImage.searchParams.get('episode'), '1');
assert.equal(playbackCard.props.imageAspect, 'landscape');
assert.equal(playbackCard.props.title, 'Land of Enchantment');
assert.equal(playbackCard.props.subtitle, 'The Curse', 'The show name belongs under the episode title, before badges');
assert.equal(playbackCard.props.description, undefined);
assert.equal(playbackCard.props.href, '/series/tt13623608/1/1', 'Playback cards link to the exact episode and enable the shared hover arrow');
const suppliedStill = PlayMediaCard({ result: { success: true, mediaId: 'tmdb:114294:1:1', mediaType: 'Episode', thumbnail: 'https://image.tmdb.org/t/p/w500/still.jpg' } });
assert.match(suppliedStill.props.image, /\/still.jpg$/, 'Prefer the still returned with single-episode metadata');
const nativeEpisodeLink = new URL(suppliedStill.props.href, 'http://localhost');
assert.equal(nativeEpisodeLink.pathname, '/api/navigator/title');
assert.equal(nativeEpisodeLink.searchParams.get('id'), 'tmdb:114294');
assert.equal(nativeEpisodeLink.searchParams.get('season'), '1');
assert.equal(nativeEpisodeLink.searchParams.get('episode'), '1');
const moviePlayback = PlayMediaCard({ result: { success: true, mediaId: 'tt0816692', mediaName: 'Interstellar', mediaType: 'Movie' } });
assert.equal(new URL(moviePlayback.props.image, 'http://localhost').searchParams.get('kind'), 'poster');
assert.equal(moviePlayback.props.imageAspect, 'portrait');
assert.equal(moviePlayback.props.href, '/movie/tt0816692');

// Preserve the existing widget's actual Light/Dark/System controls and their wiring.
let selected;
const fakeSegments = widget('segments');
const { ThemeToggleCard } = load('components/navigator/theme-toggle-card.tsx', {
    'next-themes': { useTheme: () => ({ theme: 'dark', setTheme: value => { selected = value; } }) },
    '@/components/arc/segmented-control/segmented-control': fakeSegments,
    '@/lib/utils': { cn: (...classes) => classes.filter(Boolean).join(' ') },
    './theme-toggle-card.module.css': {},
});
const card = ThemeToggleCard({});
const segments = card.props.children[1];
assert.equal(segments.type, fakeSegments);
assert.equal(segments.props.value, 'dark');
assert.deepEqual(Array.from(segments.props.options, option => option.value), ['light', 'dark', 'system']);
segments.props.onValueChange('light');
assert.equal(selected, 'light');

const configured = [];
const { createOpenCodeGoModel } = load('lib/opencode-go.ts', {
    '@ai-sdk/openai': { createOpenAI: settings => ({ responses: modelId => { configured.push({ ...settings, modelId, protocol: 'responses' }); return {}; } }) },
    '@ai-sdk/openai-compatible': { createOpenAICompatible: settings => modelId => { configured.push({ ...settings, modelId, protocol: 'chat' }); return {}; } },
});
for (const id of ['muse-spark-1.3-contributor', 'muse-spark-1.2-contributor', 'gpt-6-luna', 'gpt-5.6-luna', 'grok-4.7']) createOpenCodeGoModel(id, 'test-key', 'stable-session');
createOpenCodeGoModel('glm-5.3', 'test-key', 'stable-session');
assert.equal(configured.slice(0, 5).every(config => config.protocol === 'responses'), true, 'Muse and Luna use the Go-documented native Responses API');
assert.equal(configured[5].protocol, 'chat');
assert.equal(configured.every(config => config.baseURL === 'https://opencode.ai/inference/go/openai/v1'), true);
assert.equal(configured.every(config => config.headers['x-opencode-session'] === 'stable-session'), true);
assert.equal(configured.every(config => config.headers['user-agent'] === 'navigator/1.0'), true);
console.log('PASS: restored theme widget and controls, single confirmation, hidden readiness/handoff rows, navigation cards, action errors, and native Muse/Luna API routing.');
