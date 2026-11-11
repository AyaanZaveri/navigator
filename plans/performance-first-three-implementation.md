# First three performance changes

Implemented against `00cad70`. Source and deterministic regression checks are complete; production navigation timings and browser/native visual checks remain unverified. No build or development server was started. No skills or dependencies were installed.

## P01: let static header scenes sleep

`AdaptiveHeaderLogo` now stops requesting frames after a 360ms settling window. Scroll/image/resize/theme/mutation/visibility signals wake it again. The window covers the existing 120ms tone confirmation and 240ms crossfade.

The existing canvas-crop registry now publishes successful crop updates to subscribers. Actual animated backgrounds therefore remain readable at the existing 10Hz crop limit, including a final settling period after animation ends. Canvas-only updates do not raise sampling to the 30Hz scroll cadence. No continuous native-video blur work was added.

The original regression fixture failed because a settled static page still had a pending rAF. It now checks zero idle pixel reads, wake-up from a real crop notification, bounded final settlement, hidden-tab behavior, readable-image recovery and unsubscription.

Guidance: [MDN canvas optimization](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas), plus the existing project crop/contrast/crossfade implementation. Retained small draw-time snapshots rather than reading a discarded WebGL framebuffer asynchronously.

## P02: bound concurrent watched-history decoding

The datastore read remains one request per batch. Duplicate title requests are removed and datastore records are indexed once. Two title workers decode independent histories concurrently, so a slow first title does not prevent the second worker from progressing through subsequent titles. Each TMDB title already has a four-season concurrency bound; the title budget intentionally stays small.

The complete batch still returns one result object: this change removes serial metadata waterfalls, not the response barrier. It does not implement incremental status streaming or a persistent metadata cache. Regular episodes, specials, legacy flags and exact bitfield ordering remain unchanged. No account metadata is cached globally.

The new fixture originally failed because only one independent title lookup started. It now verifies two workers, a third title starting while the first remains held, no duplicate title decode, one datastore read, and regular/special compatibility. Existing completion/mutation/optimistic-queue tests also pass.

Guidance: [Next parallel data fetching](https://nextjs.org/docs/app/getting-started/fetching-data), [Vercel's independent-operation example](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/async-parallel.md), and [TMDB rate-limit guidance](https://developer.themoviedb.org/docs/rate-limiting). Bounded workers apply parallelism without launching every visible title at once.

## P03: prefetch destinations on deliberate intent

Shared `IntentLink` replaces forced full-route prefetch in media/episode collections, episode context, series wordmarks and Navigator results. Links start with `prefetch={false}`; a stable mouse hover or keyboard-visible focus arms the normal Next Link prefetch after 120ms. Departure/blur/unmount cancels pending work and disarms further Link scheduling. Touch navigation and ordinary anchor behavior remain unchanged.

The shared scheduler spaces launches by at least 500ms, remembers at most 64 recent destinations for 30 seconds, and bounds pending dwell work at eight entries. It skips hidden/offline/save-data/2G conditions and refuses API/external/protocol-relative destinations. The recent map stores only route strings/expiry, not server payloads or credentials. API-backed Navigator title resolution remains navigation-only.

Suggestions no longer warm all six results when a query publishes. The ExpandingSearch intent callback warms only the hovered or keyboard-active item; moving selection, closing the panel and unmounting cancel obsolete dwell work. Suggestions use documented `router.prefetch(href)` behavior; no internal Next prefetch-kind API was introduced.

This is a **launch budget**, not a claim that application code can observe prefetch completion or cap in-flight network requests. Next owns that queue. Completed speculative fetches are not abortable through the public router API. No `cacheComponents`/`partialPrefetching` configuration migration was made.

Guidance: installed Next 16.4.4 [Link](../node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md), [prefetching](https://nextjs.org/docs/app/guides/prefetching), and [useRouter](../node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md); [Vercel intent-preloading example](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/bundle-preload.md); [web.dev prefetch guidance](https://web.dev/articles/link-prefetch). The Vercel [performance blog](https://vercel.com/blog/introducing-react-best-practices) and [skills.sh entry](https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices) were reviewed as supporting guidance, not substitutes for the installed framework reference.

## Validation

- `npm run test:performance`: static sampler sleep/wake, crop notifications, title worker budget and prefetch policy.
- `npm run test:watch-history`: Stremio bitfields, mutation preservation, optimistic toggles and batching.
- Search-stream and TMDB search-page tests: native ranking, deliberate suggestion intent, retained segment cards and no repeat segment fetch/reveal.
- Artwork-loading, media-card interaction, episode skeleton, series-lazy, guest-rating and Navigator-presentation checks.
- TypeScript and lint for new helpers and directly changed sampling/backend files. Existing search synchronous-effect and legacy indentation lint findings were distinguished from new errors.
- `test-image-layout.cjs` was attempted but stopped during fixture loading on an existing unresolved `@/lib/media/playback-details` alias, before native WebView execution. No browser/native visual success is claimed and the native test was not rerun. Its navigation fixture now recognizes IntentLink, but the unrelated alias issue remains.

No measured percentage or wall-clock speedup is claimed. Follow-up production measurements should compare idle CPU, watched-state readiness with a slow provider, and speculative request volume versus destination-navigation latency.
