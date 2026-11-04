const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

async function main() {
  const ai = await import('ai');
  const zod = await import('zod');
  const { MockLanguageModelV4 } = await import('ai/test');
  const modules = new Map();
  function load(file) {
    const absolute = path.resolve(file);
    if (modules.has(absolute)) return modules.get(absolute).exports;
    const module = { exports: {} }; modules.set(absolute, module);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText, { module, exports: module.exports, console: { log() {}, warn() {} },
      require: name => name === 'ai' ? ai : name === 'zod' ? zod : name.startsWith('@/') ? load(name.slice(2) + '.ts') : name.startsWith('.') ? load(path.resolve(path.dirname(absolute), name) + '.ts') : require(name),
      setTimeout, clearTimeout, AbortController, AbortSignal, Error, SyntaxError, crypto: globalThis.crypto,
    }, { filename: absolute });
    return module.exports;
  }
  const { runTextToolLoop, needsTextToolLoop } = load('app/tools/text-tool-loop.ts');
  const { navigatorToolPolicy } = load('lib/navigator-tool-policy.ts');
  const usage = { inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 4, text: 4, reasoning: 0 } };
  const decisions = [
    { kind: 'tool', name: 'lookup', arguments: { id: 123 } }, // rejected BEFORE dispatch
    { kind: 'tool', name: 'lookup', arguments: { id: 'verified-id' } },
    { kind: 'tool', name: 'playMedia', arguments: { id: 'verified-id' } },
    { kind: 'tool', name: 'playMedia', arguments: { id: 'do-not-replay' } },
  ];
  let calls = 0, lookups = 0, plays = 0;
  const model = new MockLanguageModelV4({ modelId: 'iceman-contributor-free', provider: 'opencode.chat', doGenerate: async options => {
    assert.equal(options.responseFormat, undefined, 'The compatibility path must omit native structured response_format');
    return { content: [{ type: 'text', text: JSON.stringify(decisions[calls++]) }], warnings: [], usage, finishReason: { unified: 'stop', raw: 'stop' } };
  } });
  const events = [];
  const tools = {
    lookup: ai.tool({ inputSchema: zod.z.object({ id: zod.z.string() }), execute: async () => { lookups++; return { success: true, id: 'verified-id' }; } }),
    playMedia: ai.tool({ inputSchema: zod.z.object({ id: zod.z.string() }), execute: async () => { plays++; return { success: true, action: 'play', execution: 'prepared' }; } }),
  };
  const options = { model, tools, messages: [{ role: 'user', content: 'Play this title' }], instructions: 'Use verified tool output.', signal: new AbortController().signal,
    writer: { write: event => events.push(event) }, policy: () => ({ activeTools: ['lookup', 'playMedia'], toolChoice: 'required' }) };
  assert.equal(needsTextToolLoop(model), true);
  assert.equal(needsTextToolLoop({ provider: 'opencode.chat', modelId: 'claude-haiku-5-5' }), false);
  assert.equal(needsTextToolLoop({ provider: 'opencode.chat', modelId: 'deepseek-v4.1-flash' }), false, 'DeepSeek uses the native AI SDK tool loop');
  await runTextToolLoop(options);
  assert.equal(calls, 3);
  assert.equal(lookups, 1, 'Invalid arguments must never reach execute');
  assert.equal(plays, 1, 'A prepared action ends the turn without replay');
  assert.equal(events.filter(event => event.type === 'tool-input-available').length, 2);
  assert.equal(events.at(-1).finishReason, 'tool-calls');

  const answerEvents = [];
  const answerModel = new MockLanguageModelV4({ provider: 'opencode.chat', modelId: 'iceman-contributor-free', doGenerate: async () => ({
    content: [{ type: 'text', text: JSON.stringify({ kind: 'answer', text: 'A grounded answer.' }) }], warnings: [], usage, finishReason: { unified: 'stop', raw: 'stop' },
  }) });
  await runTextToolLoop({ ...options, model: answerModel, writer: { write: event => answerEvents.push(event) }, policy: () => ({ activeTools: ['lookup'], toolChoice: 'auto' }) });
  assert.equal(answerEvents.filter(event => event.type === 'text-delta').map(event => event.delta).join(''), 'A grounded answer.');
  assert.equal(answerEvents.at(-1).finishReason, 'stop');

  let failedCalls = 0;
  const failureModel = new MockLanguageModelV4({ provider: 'opencode.chat', modelId: 'iceman-contributor-free', doGenerate: async () => {
    failedCalls++;
    return { content: [{ type: 'text', text: JSON.stringify({ kind: 'tool', name: 'skipToSubtitleContent', arguments: {} }) }], warnings: [], usage, finishReason: { unified: 'stop', raw: 'stop' } };
  } });
  await runTextToolLoop({ ...options, model: failureModel, tools: { skipToSubtitleContent: ai.tool({ inputSchema: zod.z.object({}), execute: async () => ({ success: false, error: 'No matching scene.' }) }) },
    policy: () => ({ activeTools: ['skipToSubtitleContent'], toolChoice: 'required' }) });
  assert.equal(failedCalls, 1, 'A failed scene search cannot degrade into ordinary playback or a guessed timestamp');

  const controller = new AbortController(); controller.abort();
  await assert.rejects(runTextToolLoop({ ...options, signal: controller.signal }));
  assert.equal(calls, 3, 'User cancellation must not generate or execute anything');

  const turn = text => [{ id: 'u', role: 'user', parts: [{ type: 'text', text }] }];
  assert.deepEqual(Object.keys(navigatorToolPolicy(turn('Who directed Interstellar?'))), ['actionHandled']);
  const acknowledgedTheme = [...turn('Switch to light mode'), { id: 'a', role: 'assistant', parts: [{ type: 'tool-themeToggle', toolCallId: 'theme-1', state: 'output-available', input: { theme: 'light' }, output: { success: true, execution: 'completed' } }] }];
  assert.equal(navigatorToolPolicy(acknowledgedTheme).actionHandled, true);
  console.log('PASS: real SDK text tool protocol, schema validation before dispatch, exactly-once prepared actions, cancellation, and task-specific tool policy.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
