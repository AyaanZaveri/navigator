# Ask Navigator evaluation — 2026-11-04

Tested against the user's existing signed-in development server at localhost:3000. No server or build was started. Main model: OpenCode Go `muse-spark-1.3-contributor`; TinyFish search/fetch enabled through existing configuration. Credentials were not saved in reports.

## Findings and changes

- `Go to the confession in knives out 3` previously bypassed the explicit-scene workflow. It now uses literal intent extraction and one scene tool; the sequel number remains part of the title. A stray episode description no longer rejects an explicitly identified movie.
- Invincible's namesakes caused a title clarification before examining the Conquest clue. Scene-aware title selection now uses supplied title metadata when audience dominance alone cannot distinguish candidates. TV episode lookup also tolerates overwhelmingly obscure namesakes; substantial remake ambiguity remains explicit.
- TV scene requests without episode coordinates now use the scene description to discover the episode, including when the show's ID is already known. IDs and timestamps still come from catalog/subtitle evidence.
- Ambiguous episode metadata can now trigger TinyFish research. Specific web evidence replaces weak metadata matches rather than remaining stuck with their ambiguity. A character's cast credit alone is explicitly insufficient to substantiate a particular fight/action.
- Failed scene tools end the agent turn, preventing substitution with ordinary playback or title navigation.
- Recap/explanation analysis now uses Muse's lightweight routing settings. Structured subtitle analysis has bounded time/output allowances. A definite no-match no longer repeats the full subtitle analysis; low-confidence matches retain one deeper pass.
- Episode-only navigation stays separate from seeking. Ordinary title requests such as `Play Fight Club`, `Play Battle in Seattle`, and `Play When Harry Met Sally` do not trigger the added scene detection.
- Web answers are instructed to cite actual source links rather than internal `web:1` labels. Some unsolicited model lookup narration still appeared despite the prompt instruction; its removal is not claimed.

## Live results

| Check | Observed result |
| --- | --- |
| Final general routing suite | 18/18 passed; median 6.4s, range 1.5–14.3s |
| Known-ID navigation | Passed in 2.9s using only `navigateToMedia` |
| Two-turn person/show → first-episode playback | 2/2 passed; follow-up 4.5s using only `playMedia` |
| Repeat scene suite | 4/5 passed; Conquest failed once in 56.4s |
| Conquest targeted recheck | Passed in 27.0s after increasing structured-output allowance; earlier successful run 24.5s |
| Knives Out confession | Prepared Wake Up Dead Man at 01:58:07; repeated success, latest full-suite run 11.1s |
| Interstellar docking | Prepared seek at 02:07:16; latest full-suite run 12.2s |
| Nathan/Jimmy Kimmel + talk-show scene | Verified The Anecdote, TMDB S4E4; latest full-suite run 27.6s |
| Impossible SpongeBob/Batman scene | Failed safely, one matching pass, no fallback action; latest run 8.2s |
| GPT-6 Luna limited comparison | Episode discovery passed in 11.3s with web evidence |
| DeepSeek V4.1 Flash comparison | Three verification failures around 33–38s, then one success in 31.5s; insufficient reliability to recommend over Muse |

All 18 advertised tools were exercised: searchMedia, searchPeople, getPersonDetails, getFilmography, getMediaDetails, getSeasons, getEpisodes, findEpisode, navigateToMedia, navigateToMediaByQuery, navigateToEpisode, playMedia, getMediaStreams, themeToggle, searchMediaWeb, skipToSubtitleContent, explainScene, analyzeMedia. Legacy saved-chat tools are not advertised to the model.

API action tests verify prepared actions, targets, scene timestamps and tool sequences. They do not prove decoded playback, visual scene boundaries, or client action completion. The final browser UI smoke attempt stalled the driver; its isolated session was recovered, and no UI/playback success is claimed. Secondary-model comparisons used the existing source-route harness with isolated auth and real catalog/web/model calls.

Scene reliability remains imperfect: one initial movie request spent 75s in provider matching before bounds were added; the Conquest repeat still failed intermittently. Scene requests can require title disambiguation, episode/web verification, subtitle downloads and subtitle matching. The output-budget change and a successful retry do not establish a universal latency or reliability guarantee. Conquest has multiple encounters; successful observed resolutions included S4E5. No claim is made that an unspecified request always selects the user's intended encounter.

## Repeat the checks

The browser must already be on the signed-in dev server. The live harness prepares actions without dispatching them into the player.

```sh
node scripts/test-navigator-live.cjs --live --suite routing
node scripts/test-navigator-live.cjs --live --suite scenes
node scripts/test-navigator-live.cjs --live --suite context
node scripts/test-navigator-live.cjs --live --suite scenes --case conquest
node scripts/test-navigator-episode-live.cjs --live --model gpt-6-luna
node scripts/test-navigator-episode-live.cjs --live --model deepseek-v4.1-flash --diagnostics
```

`--out` selects a JSON report path. Default reports go under `/tmp`. A case passes only if the expected tools execute, the expected success/failure is returned, no stream error occurs, and a failed scene is not replaced by another action. Conversation reuse additionally requires exactly one playback tool on the follow-up.

Deterministic verification passed: navigator API/scene regressions, episode discovery/evidence/ambiguity, request timing, presentation, shortcuts, TMDB discovery, OpenCode continuation, TypeScript, and diff whitespace checks. Tests preserve spoiler filtering and refusal to invent unsupported episode coordinates or timestamps.


## Luna combined-request correction

The user subsequently reported an empty-season error and a `Media / Media` card for the exact combined Nathan/Jimmy Kimmel + talk-show request. The initial evaluation missed two important cases: the structured scene workflow was gated on Muse-specific provider options, and failed playback results with episode-progress errors could still render an empty playback card.

The scene workflow is now provider-independent. It extracts intent, restricts episode coordinates to explicit user text, verifies the episode, matches subtitles, and prepares one playback action. Model-supplied season defaults/guesses are discarded. Failed actions no longer render playback cards; the progress error remains visible. Empty/missing season catalogs and explicitly unavailable seasons now have distinct error messages.

The exact prompt with GPT-6 Luna completed in the before-run but performed a redundant `searchMedia` call. That run did not reproduce the user's empty-season response, so its precise original season argument is still unverified. The UI placeholder was reproduced with the actual failed-result/progress shape in a failing presentation test, then fixed. The unified path also has a regression test where the planner invents season 0; both Muse and Luna discard it and resolve the real episode.

Two live Luna checks after the correction passed (25.2s and 24.5s). The first used only `skipToSubtitleContent`, resolved The Anecdote (TMDB S4E4), and prepared playback at 17:39.892 in 25.2s. This is a correctness/orchestration improvement, not an established latency improvement. Roughly 9s of that run was subtitle loading and 7.6s was title/episode verification. Prepared playback still does not prove client execution or decoded video.


## TinyFish direct-search correction

Checked the official Search and Fetch references at https://docs.tinyfish.ai/search-api, https://docs.tinyfish.ai/api-reference/search-the-web and https://docs.tinyfish.ai/fetch-api. The original adapter used the right GET endpoint and `purpose`, but `searchMediaWeb` waited for page Fetch before returning any results. It fetched only two domain-biased sources, demoting clips, and episode lookup returned immediately on title misses.

`searchMediaWeb` now calls only `GET https://api.search.tinyfish.ai/?query=...&purpose=...`, preserving ranked titles, snippets, URLs and positions. `readMediaWebSources` is a separate tool for selected-page evidence. Explicit results/links-only requests end after Search, avoiding an extra model step or a top-up query when fewer than ten results return. Episode research publishes the ten search hits before waiting for page reads. Search result cards and progress are rendered once, labeled as search results rather than read pages. Search snippets are bounded in subsequent model context, while the UI retains the service response.

Live GPT-6 Luna result: Search 724ms, complete request 3031ms, one search call, no Fetch/read tool, nine results returned by that request. Earlier direct Search calls measured 1819ms and 2407ms. These measurements apply to search results, not episode identification or video playback. The provider may return fewer than ten public HTTPS results; the app no longer searches again just to fill a count.

Episode retrieval also starts web research immediately for dialogue, repairs misspelled titles through grounded source titles/text, ranks clue relevance rather than generic-domain preference, and rewrites the fallback query for transliteration/short fragments. Verified scene clues can survive an unverified episode and retain source links. The live Late Bloomers request now resolves the intended Late Bloomer catalog (2024, 24 episodes); the exact quote was found in a Reddit scene thread and in comments on an official show clip, but its episode identity remains unverified. Full quote-resolution attempts still took 35–46 seconds. They remain failures for episode navigation, not passing searches.

The live harness was corrected: an unrelated successful catalog search can no longer turn a failed requested action into a pass. Deterministic tests cover one-request search/no page fetch, results visible while page reading is still blocked, distinct explicit page reads, no duplicate result cards, title correction from fetched page metadata, safe partial quote evidence, and terminal episode failures without repeated search.
