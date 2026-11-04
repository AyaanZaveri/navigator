const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

async function main() {
    const ai = await import('ai');
    const openai = await import('@ai-sdk/openai');
    const compatible = await import('@ai-sdk/openai-compatible');
    const { z } = await import('zod');
    const requests = [];
    const context = { exports: {}, require: name => {
        if (name === '@/lib/server/outbound-fetch') return { providerFetch: fetch };
        if (name === 'ai') return ai;
        if (name === '@ai-sdk/openai-compatible') return { createOpenAICompatible: settings => compatible.createOpenAICompatible({ ...settings, fetch: async (_url, init) => {
            const body = JSON.parse(init.body); requests.push(body);
            return new Response(JSON.stringify({ id: 'chat_fixture', object: 'chat.completion', created: 1, model: body.model,
                choices: [{ index: 0, message: { role: 'assistant', content: '{"status":"not_found","evidence":[]}' }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }), { headers: { 'content-type': 'application/json' } });
        } }) };
        if (name === '@ai-sdk/openai') return { createOpenAI: settings => openai.createOpenAI({ ...settings, fetch: async (_url, init) => {
            const body = JSON.parse(init.body); requests.push(body);
            const output = requests.length === 1 ? [{ type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'lookup', arguments: '{}', status: 'completed' }]
                : [{ type: 'message', id: 'msg_2', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'The Anecdote.', annotations: [] }] }];
            return new Response(JSON.stringify({ id: `resp_${requests.length}`, created_at: 1, model: body.model, status: 'completed', output,
                usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 } }), { headers: { 'content-type': 'application/json' } });
        } }) };
        throw new Error(name);
    } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/opencode-go.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
    const model = context.exports.createOpenCodeGoModel('muse-spark-1.3-contributor', 'fixture', 'stable-session');
    assert.equal(model.provider, 'opencode-responses.responses');
    const result = await ai.generateText({ model, prompt: 'Look up the episode.', maxRetries: 0, stopWhen: ai.isStepCount(3),
        tools: { lookup: ai.tool({ inputSchema: z.object({}), execute: async () => ({ title: 'The Anecdote' }) }) } });
    assert.equal(result.text, 'The Anecdote.');
    assert.equal(requests.length, 2);
    assert.ok(requests.every(request => request.store === false));
    assert.ok(requests[1].input.some(item => item.type === 'function_call'));
    assert.ok(requests[1].input.some(item => item.type === 'function_call_output'));
    assert.ok(requests.every(request => request.input.every(item => item.type !== 'item_reference')));
    const deepseek = context.exports.createOpenCodeGoModel('deepseek-v4.1-flash', 'fixture', 'stable-session');
    const structured = await ai.generateText({ model: deepseek, prompt: 'Assess the evidence.',
        output: ai.Output.object({ schema: z.object({ status: z.enum(['matched', 'not_found']), evidence: z.array(z.string()) }) }) });
    assert.equal(structured.output.status, 'not_found');
    assert.equal(requests.at(-1).response_format.type, 'json_schema', 'Compatible Go models receive the evidence schema');
    console.log('PASS: real AI SDK OpenCode tool continuation sends complete items with store:false.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
