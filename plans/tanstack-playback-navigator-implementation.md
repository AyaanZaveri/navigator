# Shared stream queries and Navigator performance

Implemented against main with the concurrent Continue Watching preference and episode video-preloading work preserved.

## Shared stream discovery

Pinned `@tanstack/react-query` 5.107.1. A QueryClient lives under the verified account/session layout; reload, restart and session replacement discard it. Ordinary route navigation and soft refresh retain it. Stream data is never persisted or dehydrated into server HTML.

Typed query families cover canonical IDs (five-minute freshness/GC), configured add-ons (30-second freshness/60-second GC), and individual add-on responses (30-second freshness/60-second GC). An opaque configuration revision plus canonical target and provider index identify stream queries without putting configured URLs in query keys. Canonical ID and add-on-list discovery start together. TanStack is the response cache; the adapter retains progressive snapshots and request leases rather than another response map.

Continue Watching, title/episode stream lists, player resolution, ordinary Navigator Play and next-episode discovery use the same queries. Progressive ordering and settled-prefix behavior remain unchanged. An unfinished aggregate request is reused even if an earlier provider's result ages past freshness. Read hits do not extend freshness. Automatic mount/focus/reconnect refetches and query retries are disabled. Failed provider queries can be retried without refetching fresh healthy providers; unused empty/failed responses are removed.

Leases and passive observers protect unfinished page-to-player transfers and Strict Mode replay. Unclaimed speculation has its original 30-second lifetime and two-target budget; active discovery has a 45-second overall deadline plus existing per-request timeouts. Session disposal cancels all work. Configuration invalidation advances the generation without refetching or interrupting an active consumer; explicit Retry invalidates the target. External account changes become visible through the short add-on-list freshness window.

Unused query data is bounded to 12 target groups and 8 MiB of serialized payload, with least-recent-use eviction; unused canonical IDs are bounded to 128. These are retained-cache bounds, not a claim about total JavaScript heap: active consumers and caller-held playback snapshots may still reference results. The existing Zod package validates upstream stream records once on the server, retaining extension fields and torrent records. Outbound limits and cancellation remain in force.

## Navigator rendering and context

The installed SDK's `throttle: 50` batches streamed message publication while tool callbacks, Stop, status and error updates remain immediate. A linear turn derivation reuses completed rows without rescanning their parts. Memoized message rows receive stable row/callback inputs. Existing cancellation/retry, transcript ordering, completion timing, scrolling and animations remain intact.

Chat page context resolves the TMDB ID once, then fetches basic title and exact episode data concurrently. It no longer loads credits or a season list before generation. Episode names use the helper's `name` field. Episode failure retains useful title context; cancellation stops generation.

Explicit server-side stream comparison/list tools remain separate. This change does not migrate all application data to Query or alter video-byte preload policies.

## Verification and limits

Real QueryClient regressions cover unfinished quick Play, alias deduplication, progressive ordering, partial failures, expiry, manual invalidation, consumer cancellation, lifecycle replay, speculative expiry/caps, session reset, retained-byte/count bounds and Zod parsing. The actual player loading callback is exercised with the session-query boundary. Navigator tests cover 80-message row identity/zero completed-part rescans, timing equivalence, cancellation/reset, concurrent narrow context calls and partial failures.

TypeScript, new-source lint, baseline-comparison lint, performance, stream selection, playback/episode, Continue Watching, episode-continuation/video-preload, Navigator/UI, guest and security checks passed. No new lint findings relative to the existing baseline. No production build, new server, browser automation, native package or live timing measurement was run. No percentage, startup-time or frame-rate improvement is claimed.

## Documentation reviewed

- Installed Next.js 16.4.4 client-data guidance and [official Next/TanStack integration](https://nextjs.org/docs/app/guides/client-side-data-fetching/tanstack-query).
- [TanStack prefetching](https://tanstack.com/query/latest/docs/framework/react/guides/prefetching), [query options](https://tanstack.com/query/latest/docs/framework/react/guides/query-options), [defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults), and [cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation). The pinned package's `QueryClient.query` and observer source were checked; no experimental streaming helper is used.
- Current upstream [TanStack chat example](https://github.com/TanStack/query/tree/main/examples/react/chat) and [Next client cache example](https://github.com/nextjs/next-spa-patterns/tree/main/app/react-query); [maintainer guidance on freshness and shared identity](https://tkdodo.eu/blog/react-query-as-a-state-manager).
- Installed AI SDK source/docs for stable `throttle`, immediate callbacks/status and terminal-message publication; [Zod's schema/parsing guidance](https://github.com/colinhacks/zod/blob/main/packages/docs/content/basics.mdx).
