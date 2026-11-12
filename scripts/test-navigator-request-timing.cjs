const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual request/action/final-reply lifecycle with a controlled clock.
let now = 0;
class Clock extends Date { static now() { return now; } }
function load(file, dependencies = {}, globals = {}) {
    const context = { exports: {}, require: name => dependencies[name] || require(name), ...globals };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, context, { filename: file });
    return context.exports;
}
const chat = load('lib/navigator-chat.ts');
const timing = load('lib/navigator-timing.ts', { './navigator-chat': chat });
const ack = load('lib/navigator-playback-ack.ts', {}, { setTimeout, clearTimeout });
const react = require('react');
const slots = [];
let index, config, messages = [], toolOutput, playbackCalls = 0;
const document = new EventTarget();
const hooks = {
    ...react,
    useState(initial) {
        const slot = index++;
        if (!(slot in slots)) slots[slot] = initial;
        return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
    useRef(initial) { const slot = index++; return slots[slot] ||= { current: initial }; },
    useMemo: fn => fn(), useEffect: () => {},
};
const { default: AIAsk } = load('components/navigator/ai-ask.tsx', {
    react: hooks,
    '@ai-sdk/react': { useChat: options => {
        config = options;
        return { messages, sendMessage: async () => {}, status: 'ready', clearError() {},
            addToolOutput(value) { toolOutput = value.output; } };
    } },
    ai: { DefaultChatTransport: class {}, lastAssistantMessageIsCompleteWithToolCalls: () => false },
    jotai: { useStore: () => ({ get: () => 0 }), useAtom: () => [true, () => {}] },
    sonner: { toast: { error() {} } },
    'next/navigation': { useRouter: () => ({ push() {} }), usePathname: () => '/' },
    'next-themes': { useTheme: () => ({ setTheme() {}, resolvedTheme: 'dark' }) },
    '@/lib/navigator-chat': chat,
    '@/lib/navigator-playback-ack': ack,
    '@/lib/navigator-timing': timing,
    '@/lib/atoms': {},
    '@/components/stream-query-provider': { useStreamQueries: () => null },
    '@/contexts/settings-context': { useSettings: () => ({}) },
    '@/contexts/MediaPlayerContext': { useMediaPlayer: () => ({ playMedia() { playbackCalls++; }, isPlayerVisible: true, skipToTimestamp() {} }) },
    '@/lib/preload-tools': { preloadPlayer() {} },
    './focus': { NavigatorFocus: 'focus' },
}, { Date: Clock, AbortController, document, setTimeout, crypto: require('node:crypto').webcrypto });
function render() { index = 0; return AIAsk({ userId: 'user' }).props; }
const user = { id: 'request', role: 'user', parts: [{ type: 'text', text: 'Go to the confession' }] };
const prepared = { id: 'action', role: 'assistant', parts: [{
    type: 'tool-playMedia', toolCallId: 'play-1', state: 'output-available',
    output: { success: true, execution: 'prepared', preparedToolCallId: 'play-1', action: 'play', mediaId: 'movie', mediaName: 'Movie', mediaType: 'Movie' },
}] };
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
(async () => {
    render().onInputChange('Go to the confession');
    now = 1000;
    await render().onSubmit({ preventDefault() {} });
    messages = [user, prepared];
    now = 5000;
    config.onFinish({ messages, isAbort: false, isError: false });
    await tick();
    assert.equal(playbackCalls, 1);
    assert.equal(toolOutput, undefined, 'Playback must still await real player confirmation');
    assert.equal(render().responseDurations.action, undefined, 'Do not display Done while buffering');
    now = 21000;
    document.dispatchEvent(new CustomEvent(ack.NAVIGATOR_PLAYBACK_EVENT, { detail: { actionId: 'play-1', state: 'playing' } }));
    await tick();
    assert.equal(toolOutput.status, 'completed');
    messages = [user, { ...prepared, parts: [{ ...prepared.parts[0], output: toolOutput }] },
        { id: 'answer', role: 'assistant', parts: [{ type: 'text', text: 'Skipped to the confession.' }] }];
    now = 24000;
    config.onFinish({ messages, isAbort: false, isError: false });
    assert.equal(render().responseDurations.answer, 4, 'Exclude sixteen seconds of buffering and the confirmation reply');

    // A subsequent ordinary reply must not reuse the previous playback cutoff.
    render().onInputChange('Tell me about this movie');
    now = 30000;
    await render().onSubmit({ preventDefault() {} });
    messages = [{ ...user, id: 'next-request' }, { id: 'next-answer', role: 'assistant', parts: [{ type: 'text', text: 'A mystery.' }] }];
    now = 37000;
    config.onFinish({ messages, isAbort: false, isError: false });
    assert.equal(render().responseDurations['next-answer'], 7);
    console.log('PASS: Navigator handoff timing excludes buffering, retains playback confirmation, and resets for the next request.');
})().catch(error => { console.error(error); process.exitCode = 1; });
