# Shared playback metadata implementation

Implemented against the existing session-owned TanStack Query 5.107.1 client, without new dependencies or persistent storage.

## Shared readers and projections

`lib/media/metadata.ts` defines validated title and episode envelopes, source timestamps, coverage and unavailable fields. Ratings carry source and scope; episode air dates and runtimes remain separate from show release information. Generic episode labels are presentation fallbacks. The playback projection now retains TMDB rating/source/vote fields.

The existing title and exact-episode readers share a bounded server parsed-success cache. Its identities hash the account/session, configured providers and TMDB configuration; no credentials enter browser query keys or dehydrated records. Successful server reads expire after five minutes; single-flight reads survive one caller's cancellation. The cache retains at most 64 successes and 16 MiB, excludes failures and oversized successes, and caps concurrent single flights at 64. Existing outbound-fetch limits/no-store policies remain in force.

Episode headers first reuse an exact warmed record, preserve embedded episode metadata when present, and otherwise request the exact episode. They do not load a season list just to construct that header. Season browsing remains separate.

## Browser sharing and page seeding

Title/episode query options use 15-minute freshness and 30-minute inactive retention. Stream and metadata discovery share base-title identity resolution. Metadata keys include session, opaque configuration revision, type, canonical base ID, fixed upstream locale (`en-US`) and episode coordinates.

Playback actions synchronously use a fresh metadata hit and start/join independent required reads. Player discovery, ordinary Navigator Play and next-episode preparation use the same service. Metadata is never awaited before stream resolution/video startup. Mounted headers/player retain observers; inactive LRU bounds are 64 titles, 128 episodes and 8 MiB. Partial fields/artwork/ratings preserve known values; distinct rating sources are merged separately. Demand-driven configuration checks do not hide fresh metadata merely because the last configuration check is old. Explicit configuration invalidation excludes the old records immediately.

Server-rendered movie/series/episode pages hydrate metadata only with original source timestamps. Sparse cards do not seed header queries. Older hydration cannot replace newer browser results. Each server hydration client is cleared after serialization. Full refresh/session replacement clears the browser client; ordinary navigation preserves it.

Server reuse is process-local and best effort across hosting replicas. No zero-request or measured startup-speed claim is made.

## Warming and controls

Settings → Playback includes **Preload metadata**, enabled by default and independent of stream/next-video preloading. Four visible Continue Watching cards are considered after idle time, with two target preparations in parallel and no wait for stream or artwork completion. Hover/focus uses a 120 ms dwell and prioritizes queued work. Idle cards are not repeatedly refreshed.

The session-level queue survives route handoffs. Authentication, hidden/offline, slow-network, save-data and preference gates stop speculation without canceling required consumers. Logo and exact-episode still image downloads have a separate two-image, low-priority queue; existing DOM requests are reused. Full backdrops warm only on deliberate intent. Query stores references, never image bytes.

## Validation

- `npm run test:metadata`: real QueryClient sharing, canonical aliases, quick Play, synchronous warm command, cancellation isolation, per-episode isolation, timestamps/expiry, configuration invalidation, partial failures/retry, partial fields and rating sources, server hydration privacy, session isolation, active/unused memory bounds, server single flight, and artwork/concurrency rules.
- Existing playback/stream selection, Continue Watching, continuation, Navigator, artwork/performance, preference, guest/security and lazy-series checks.
- TypeScript without incremental output; lint on new modules plus a comparison against the existing tracked-file lint baseline.

No production builds, browser automation, native packages or live warm/cold timing measurements were run.

## References used

- [Next.js TanStack Query integration](https://nextjs.org/docs/app/guides/client-side-data-fetching/tanstack-query), including the installed Next documentation.
- [TanStack shared query options](https://tanstack.com/query/latest/docs/framework/react/guides/query-options).
- [Placeholder data](https://tanstack.com/query/latest/docs/framework/react/guides/placeholder-query-data) and [initial data/source freshness](https://tanstack.com/query/latest/docs/framework/react/guides/initial-query-data).
- [TanStack cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation) and [advanced server rendering](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr).
- [Seeding the query cache](https://tkdodo.eu/blog/seeding-the-query-cache).
- [TMDB exact episode details](https://developer.themoviedb.org/reference/tv-episode-details).
