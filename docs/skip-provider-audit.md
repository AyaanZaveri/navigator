# Skip timing provider audit — 2026-11-02

53 curl requests in the final repeatable audit: nine distinct episodes, with a
second runtime for Modern Family S08E16. Additional discovery and diagnostic
requests checked schemas, release clusters, confidence, and CORS. Successful
HTTP responses demonstrate availability during this sample, not long-term uptime
or independently verified frame accuracy. Runtimes are explicit test inputs;
they are not assumed to describe every release of an episode.

Run `python3 scripts/audit-skip-providers.py` to repeat the live audit. It performs
read-only lookups, including SkipMe's documented POST lookup, and never submits
markers, generates credentials, creates streams, or impersonates another client.
Run `npm run test:skip-segments` for the offline regression checks.

## Results

| Provider | Live result | Decision |
| --- | --- | --- |
| [TheIntroDB](https://api.theintrodb.org/) | 10/10 lookups HTTP 200, median 200 ms. Detailed S08E16 credits: start 641,366 ms, null end, confidence 0, two submissions. Some other accepted results also have weak confidence or a different release duration. | Retain, but request `details=true`, `merge_unknown=false`; reject zero confidence, invalid ranges, and release groups more than 15 seconds from playback. Weak positive confidence below 0.5 ranks after stronger fallbacks. |
| [IntroDB](https://introdb.app/) | 10/10 HTTP 200, median 346 ms. S08E16 all segments null. Useful markers on Modern Family pilot, Game of Thrones pilot, Loki S01E02, The Office pilot; some missing values on other episodes. | Retain the restricted same-origin proxy because browser CORS is restricted. |
| [SkipDB](https://skipdb.tv/docs) | 10/10 HTTP 200, median 135 ms; browser CORS permits anonymous reads. S08E16 intro 65,700–78,000 ms and credits 1,263,000–1,342,100 ms, confidence 0.9 for runtime 1,342.1 seconds. A 1,290-second lookup is explicitly `out-of-range`, confidence 0.6. Other tested titles have records, but some disagree with existing providers. | **Integrated as a conservative fallback**, never promoted globally on latency alone. Require exact/shifted runtime match, confidence at least 0.8, valid offsets and bounds. Never use season-level estimated intro lengths as episode markers. |
| [IntroHater](https://github.com/introhaterapp/IntroHater/blob/main/src/routes/api.js) | 10/10 HTTP 200, median 328 ms. S08E16 and adjacent S08E15/S08E19 return `[]`. Other records include imported IntroDB data. Game of Thrones S01E01 returns conflicting intro ranges: 7–16, 437–535, and 745–1,033 seconds. Its [v1 API](https://github.com/introhaterapp/IntroHater/blob/main/src/routes/v1.js) returns 401 without a key. | Do not add an unfiltered source with conflicting records and no demonstrated extra trustworthy coverage in this sample. |
| [PublicMetaDB](https://publicmetadb.com/api-docs) | Documented `/api/external/skips` returns 401 for both Modern Family and Game of Thrones. The public panel's PocketBase read returns 0 submitted records for those shows in these requests. | No authenticated integration without an appropriate key and demonstrated useful coverage. Public panel reads are not a replacement for its supported external API. |
| [SkipMe.db](https://github.com/intro-skipper/skipme.db-plugin) | Official released plugin supplies `https://database.skipme.deno.net/v3`. Documented `/movies` batch lookup returns HTTP 403, `Client not supported`, for Modern Family and comparison episodes. | No integration; coverage remains unknown. Do not spoof the approved Jellyfin client. |
| [TorBox](https://support.torbox.app/en/articles/12663030-technical-web-streaming-intro-detection) | [Official OpenAPI](https://api.torbox.app/openapi.json) documents `/v1/api/stream/getstreamdata` with required file and presigned tokens. Calling without those returns 422. Its documentation acknowledges processing delay and possible inaccuracy. | Not a general anonymous IMDb episode database. Requires a separate authorized, file-specific TorBox integration; this episode's coverage remains unverified. No stream was created for the audit. |
| [SkippTV](https://github.com/rjousse18/skipp_tv/blob/main/data.csv) | Public CSV fetch HTTP 200. Eleven rows: Game of Thrones S01E01–S01E10 and S02E01 only. No Modern Family record. | No useful additional coverage for this case; do not add a GitHub CSV download to playback. |
| [Stremio Skip Button](https://github.com/shugi12345/stremio-skip-button/blob/main/skip-intro.plugin.js) | Source's hosted server responds HTTP 404 “No active service” for both tested episode routes. | Not usable. |
| [The Open Skip Database](https://github.com/The-Open-Skip-Database/db) | Repository advertises `https://tosd.qtchaos.de`; documented episode route fails TLS for both tested shows. | Not usable in these checks; do not confuse it with SkipDB. |
| [Fed-Skips](https://github.com/p-stream/p-stream/blob/dev/src/components/player/hooks/useSkipTime.ts) | Source's exact `https://fed-skips.pstream.mov/{imdb}/{season}/{episode}` hostname fails DNS for both shows. Integration also requests Turnstile tokens. | Not usable in these checks. |

## Why the S08E16 credits range is wrong

TheIntroDB's anonymous endpoint returns accepted submissions only. Its official
API documentation describes weighted averages, not independently verified
playback observations. `details=true` reveals the zero confidence and two
submissions omitted from the default response. A null credits end means the
end of the current video: 641.366 seconds to the end of a roughly 21.5-minute
episode makes nearly half the story skippable.

The API allows open-ended credits submissions and describes asynchronous
verification/auto-acceptance. Its documented absolute maximum credits duration
is 30 minutes when an end is supplied, which is not a useful relative sanity
check for a sitcom. This explains why the format can pass validation; the
public response does **not** reveal the individual submissions or moderation
history, so the precise acceptance decision cannot be established. Averaging
a “no credits” sentinel with a real end marker is a possible explanation, not
a verified diagnosis. Disabling unknown-duration merging did not change this
particular response.

The documented authenticated lookup can include the caller's **own** pending
submissions, weighted 10 times more heavily. It does not expose everyone's
pending timestamps for playback cross-checking. Navigator does not use an API
key for this lookup and therefore did not ingest pending rows. It cross-checks
usable accepted alternatives instead; pending markers are not trusted fallbacks.

## Selection and performance

Selection happens independently for intro, recap, and credits:

1. Valid TheIntroDB segments with confidence at least 0.5 (legacy responses
   without a confidence field retain their existing priority).
2. Valid IntroDB segments.
3. SkipDB segments with confidence at least 0.8 and exact/shifted runtime match.
4. Valid positive-confidence TheIntroDB segments below 0.5, only if no better
   source supplies that segment type.

Zero/invalid confidence, invalid bounds, credits starting at zero, and credits
covering more than half the video are discarded. The half-runtime rule is a
sanity guard, not a claim about where credits must start. SkipDB's `agnostic`
and `out-of-range` records, offsets exceeding its documented 2-second exact or
15-second shifted windows, and wrong-episode responses are rejected. TheIntroDB
release groups more than 15 seconds away are also rejected: its own matching
can fall back to a popular release even when no close version exists.

All providers run in parallel with bounded requests. Valid results publish
progressively, so a slow fallback does not delay the first usable button.
Both IMDb-only fallbacks share a single TMDB-to-IMDb translation. Provider
failure never blocks playback. Cancellation prevents updates to an old player.
No subtitle embeddings, AI calls, extra backend probe, or persistent skip database
was introduced. SkipDB is called directly from the client; attribution appears
in Settings. IntroDB retains its existing proxy.

For S08E16 the new source supplies real markers for its **22:22.1 release**.
The short **21:30 test release** still has no trustworthy intro match and shows
no guessed Skip Intro button. No proportional timestamp conversion is inferred
from runtime alone.

## Data attribution

[SkipDB](https://skipdb.tv) timestamp data is licensed under
[ODbL 1.0 + Service Provider Reciprocity](https://skipdb.tv/license).
Navigator uses the read API to display skip times; it does not seed or maintain
a private skip database. Source code was inspected for API documentation;
provider implementation code was not copied into Navigator.
