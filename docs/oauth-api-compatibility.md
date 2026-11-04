# OAuth API compatibility check — 2026-11-04

The user-reported GPT-6 Luna failure was reproduced on the existing dev server with the configured custom OpenAI-compatible API. The greeting worked, while the combined Nathan/Jimmy Kimmel + talk-show request emitted the generic Navigator error.

## Current deployment: ChatMock-style core and Ollama

The subsequent update replaces the production AI SDK chat conversion layer with a shared native Responses core based on [RayBytes/ChatMock](https://github.com/RayBytes/ChatMock) at `a26ef0a`:

```text
OpenAI Chat Completions ─┐
Ollama chat/generate ────┴─ request normalization → authenticated Responses → shared SSE parser → client JSON/SSE/NDJSON
Native Responses/images ───────────────────────── same authenticated transport
```

The existing Durable Object remains the sole OAuth-session owner, with the allowlisted Vercel upstream relay. This ports ChatMock's protocol architecture to the existing TypeScript Worker; it does not run the Python server or add its WebSocket/stateful replay features. Native Responses remains stateless.

| Setting | Value |
| --- | --- |
| OpenAI base URL | `https://openai-oauth-api.vercel.app/v1` |
| Ollama base URL | `https://openai-oauth-api.vercel.app` |
| Direct Worker Ollama base | `https://openai-oauth-api.ayaanzaveri08.workers.dev` |
| Model | `gpt-6-luna` |
| Authentication | Existing API key, sent as `Authorization: Bearer …` |

Ollama supports `/api/tags`, `/api/show`, `/api/version`, `/api/chat`, and `/api/generate`. Chat/generate stream NDJSON by default; `stream:false` returns JSON. JSON mode, schema output, images, reasoning, function tools and tool-result history share the Responses conversion. Discovery caches the actual model catalog for one hour with concurrent requests coalesced. Local model downloads, embeddings, token-ID context and raw templates are unavailable. Hosted models use their sampling defaults. Model metadata identifies remote models; token counts come from upstream and total duration is measured, with no fabricated inference timings.

Navigator now has an optional Ollama API-key field that is persisted per device and sent to its server route. Leave it empty for an unauthenticated local Ollama instance. Use the root host URL above for this hosted adapter.

Live production SDK checks passed for strict schema output and streamed tool-result continuation with both the OpenAI-compatible and Ollama SDKs. The original Nathan/Jimmy Kimmel scene request also passed through the signed-in Navigator dev server:

| Navigator provider | Prepared result | Request duration |
| --- | --- | ---: |
| OpenAI | The Anecdote, S4E4, at 17:39.892 | 29.79s |
| Ollama | The Anecdote, S4E4, at 17:39.892 | 26.13s |

Each used one `skipToSubtitleContent` tool and returned no errors. These are individual requests with variable model/research/subtitle latency, not a controlled speed comparison; they validate prepared actions, not decoded playback.

Production Worker version: `55a76efd-9b16-4884-93c2-20367146f417`; previous pre-migration version: `5eae0787-fb8c-4757-877e-24c080cf2b01`. Vercel deployment: `openai-oauth-3c9sr1lly-ayaanzaveri08s-projects.vercel.app`.

Validation passed: 24 local proxy conversion/sampling/schema checks, 13 Vercel routing/security checks, six deployed authorization checks, Navigator regressions and both TypeScript checks. Local checks cover fragmented UTF-8 and CRLF streams, strict schemas, JSON mode, image conversion, parallel tool IDs/indexes, thinking, replay order, failure/truncation, cancellation, catalog caching, authentication and relay isolation. Deployment sources and attribution remain in the two external project directories listed below; no credentials are checked into Navigator.

## Earlier diagnosis and measurements

The following sections describe the initial repair before the shared-core replacement.

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
