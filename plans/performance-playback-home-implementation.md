# Playback and home performance follow-up

Implemented after `568bff3`, following audit findings P04, P05 and P07, plus bounded Continue Watching stream discovery.

## Behavior

- Player time events update a ref and the existing timestamp store instead of player-root state. Captions, skip controls and the end-time label subscribe independently. Subtitle timing callbacks and chapter cues retain stable identities.
- Subtitle text is prepared once per file. Repeated timestamps in the current cue interval reuse the same object; interval changes and seeks use binary search. Existing timing, overlap, authored top placement and appearance behavior are preserved.
- Continue Watching automatically warms only the first eligible exact playback target after visible home content settles and idle time is available. Deliberate hover or keyboard focus can warm another target after 120ms. At most two speculative requests exist, with a 30-second lifetime. Hidden pages, save-data and slow connections suppress speculative work.
- Warmup fetches stream metadata only. It does not probe sources or download video. Account/page disposal aborts unclaimed work; Play adopts the exact request and its existing promise. A quick click before the dwell starts discovery immediately and hands that same request to playback. An unfinished request survives home teardown and immediate playback cleanup/setup replay. Explicit Retry invalidates it; a failed speculative lookup gets one fresh attempt.
- Initial authenticated and guest catalog rows resolve through separate Suspense boundaries. Lazy batches deliver individual NDJSON results as ready, preserving section order and virtualized slots. A failed row retries independently. Scrolling away aborts unfinished work without discarding delivered rows. Legacy JSON callers remain supported.

## Validation

TypeScript and new-source ESLint passed. Existing playback, stream selection, subtitle settings/timing/appearance, resume, skip and episode-continuation checks passed. Home pagination, guest discovery, palette, artwork and media-card interaction checks passed.

New deterministic regressions cover:

- 500 distinct clock events with zero player-root time state updates; 10,000 cues prepared once; stable unchanged-cue snapshots, gaps and backward seeks.
- Two-title warmup limits, expiry, cancellation, exact episode identity and account/page cleanup. Quick Play adopts a deliberately unfinished request; lifecycle replay reuses it without another lookup.
- Real React server streaming with one slow row held pending, progressive lazy rows, isolated failures/retry, viewport cancellation, and UTF-8 split across stream chunks.

No production build, new server, browser automation or native visual testing was run. No startup-time, frame-rate or percentage speedup is claimed. Live startup/network measurements remain necessary to tune warmup timing and assess real provider latency.

## Documentation and examples reviewed

- Installed Next.js guides under `node_modules/next/dist/docs/` and [Next data fetching/streaming](https://nextjs.org/docs/app/getting-started/fetching-data).
- [React use](https://react.dev/reference/react/use): stable server-created promises passed into client components; one Suspense boundary per independently useful row.
- [React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore): stable snapshots and event subscriptions for clock-driven leaves.
- [React Suspense](https://react.dev/reference/react/Suspense) and [MDN AbortSignal.any](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static): independent boundaries and composed cancellation.
- [Vercel Suspense example](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/async-suspense-boundaries.md), [memoization example](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/rules/rerender-memo.md), [skills.sh catalog](https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices), and [Vercel engineering guidance](https://vercel.com/blog/introducing-react-best-practices).

No new framework flags, dependencies or installed skills were needed.
