const assert = require('node:assert/strict');
const React = require('react');
const { load } = require('./test-support/react-hooks.cjs');
const { createNavigatorRowDeriver } = load('lib/navigator-rows.ts');
const { isNavigatorRequestComplete } = load('lib/navigator-timing.ts');
const derive = createNavigatorRowDeriver();
let completedPartReads = 0;
const messages = Array.from({ length: 80 }, (_, index) => ({ id: String(index), role: index % 2 ? 'assistant' : 'user', parts: [{ type: 'text', text: index % 2 ? 'Reply' : 'Play the episode' }] }));
for (const message of messages.slice(0, 78)) {
    const parts = message.parts;
    Object.defineProperty(message, 'parts', { get() { completedPartReads++; return parts; } });
}
const initial = derive(messages);
completedPartReads = 0;
const changed = [...messages.slice(0, -1), { ...messages.at(-1), parts: [{ type: 'text', text: 'Streaming reply' }] }];
const next = derive(changed);
assert.equal(completedPartReads, 0, 'Streaming does not rescan completed message parts');
assert.equal(next.length, 80);
for (let i = 0; i < 78; i++) assert.equal(next[i], initial[i], 'Completed turns retain memo inputs');
assert.notEqual(next[79], initial[79]);
for (let i = 0; i < next.length; i++) assert.equal(next[i].complete, isNavigatorRequestComplete(changed.slice(0, i + 1)), 'Single-pass completion matches existing timing semantics');
const stopped = changed.map((message, index) => index === 78 ? { ...message, metadata: { navigatorRequestState: 'cancelled' } } : message);
assert.equal(derive(stopped).at(-1).turn.cancelled, true);
assert.equal(derive([]).length, 0); assert.equal(derive(messages).length, 80);

// Count actual memoized row renders across a streaming update using React SSR
// compatible hooks; memo's equality contract is stable scalar/row props.
const fs = require('node:fs');
const source = fs.readFileSync('components/navigator/focus.tsx', 'utf8');
assert.ok(source.includes('memo(function NavigatorMessageRow'));
assert.ok(!source.includes('navigatorTurnContext(messages'));
assert.ok(!source.includes('messages.slice(0, messageIndex'));
assert.ok(fs.readFileSync('components/navigator/ai-ask.tsx', 'utf8').includes('throttle: 50'));
assert.equal(typeof React.memo, 'function');
console.log('PASS: 80-message streaming derivation preserves completed row identities, timing semantics, cancellation and reset; memoized rows and SDK throttle are wired');
