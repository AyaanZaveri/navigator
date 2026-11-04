# OAuth API compatibility check — 2026-11-04

The user-reported GPT-6 Luna failure was reproduced on the existing dev server with the configured custom OpenAI-compatible API. The greeting worked, while the combined Nathan/Jimmy Kimmel + talk-show request emitted the generic Navigator error.

## Cause and fix

Two layers lost the schema contract:

- Navigator's custom-compatible provider did not enable structured output support, so the SDK sent `response_format: {type: "json_object"}` rather than the five-field scene-planning schema.
- The deployed proxy's Chat Completions handler ignored `response_format`, including an explicit strict JSON schema. Its native Responses handler preserved `text.format` and succeeded with the same model and prompt.

Navigator now enables schema support on custom-compatible providers and reports invalid structured output explicitly. The proxy now forwards the schema through AI SDK structured output for streaming and non-streaming Chat Completions, preserves the strict flag, and rejects malformed formats.

## Deployment and checks

The original Vercel URL remains `https://openai-oauth-api.vercel.app/v1`. It already forwards to a Cloudflare Worker that owns the OAuth session and uses an allowlisted Vercel upstream relay. The fixed Worker was deployed as version `5eae0787-fb8c-4757-877e-24c080cf2b01`, preserving credentials and Durable Object storage. Its previous version was `a20438d6-35da-459f-8c6e-2dca8b4393f1`.

The exact request passed through the real Navigator dev-server route with GPT-6 Luna:

| API base | Result | Total request time |
| --- | --- | ---: |
| Original Vercel URL | The Anecdote, S4E4, prepared at 17:39.892 | 19.8s |
| Direct existing Worker URL, `https://openai-oauth-api.ayaanzaveri08.workers.dev/v1` | Same prepared episode and timestamp | 17.0s |
| Isolated compatibility Worker | Same prepared episode and timestamp | 29.0s |

These are individual warm requests, including variable episode research and subtitle loading; they do not establish a hosting speed advantage. They verify prepared scene actions, not decoded playback. Direct SDK strict-schema extraction and streamed function-call/result continuation passed. Six deployed authorization/security checks passed after deployment. Three new schema-forwarding regression tests failed before the proxy fix and passed afterward; sampling, Navigator regression/presentation/continuation tests and both projects' TypeScript checks passed.

The isolated test Worker is `https://openai-oauth-compat-test.ayaanzaveri08.workers.dev/v1`. It delegates native Responses to the existing service and does not duplicate OAuth credentials or session storage. It is a compatibility-adapter test, not a ChatMock deployment.

## ChatMock comparison

Reviewed [RayBytes/ChatMock](https://github.com/RayBytes/ChatMock) at `a26ef0a`. It explicitly maps Chat Completions JSON schemas to Responses schemas and has additional output/route compatibility coverage. Sixteen response-format, structured-output wire and chat-route fidelity tests passed locally. No live ChatMock OAuth login, production deployment, or speed comparison was performed. Keeping the repaired existing deployment avoids a stack/session-storage migration for this specific bug.

Proxy source and its deployment notes are at `/Users/ayaanzaveri/Code/openai-oauth-cloudflare`; the Vercel relay source is at `/Users/ayaanzaveri/Code/openai-oauth-vercel`. No user key or OAuth credentials are included in this report or repository changes.
