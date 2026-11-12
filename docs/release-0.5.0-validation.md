# Windows 0.5.0 local build validation

This build integrates main through `6d60313`, the shipped `release-0.4.1` native playback/cache changes, and the Windows updater. Production source was compiled from `e03939c587e1ca5cd4d1efb6e0358403b50e5f4b` exclusively on the Zenbook over SSH. No GitHub push, release publication, feed publication or replacement of the installed 0.4.1 app was performed.

## Passed validation

- Optimized Windows x64 native build with static CRT; ProductVersion 0.5.0.
- Production Next.js build and Windows TypeScript check; npm/Cargo version metadata and locks agree on 0.5.0.
- Native default regression suite: 26 passed, nine optional/fixture tests excluded from that default run.
- Four real-libmpv fixtures: playback/session replacement/resume; preview position preservation; new keyframe previews sharing playback bytes without refetch; fallback at the resume position. The shared-byte fixture served exactly one 279,674-byte origin response for playback, indexing and two different preview frames.
- Nine real WinSparkle cases covering empty/equal/older feeds, valid signatures, same-size tampering, missing signatures, wrong keys and missing/malformed feeds.
- Six actual-NSIS staging tests: reject unrelated populated folders; replace a recognized installation; preserve the old installation on preparation failure; preserve interrupted backups and prior staging; relaunch after a silent update.
- Actual packaged startup preparation; readiness/redirect/unhealthy-service/owned-child cleanup regression checks.
- Native desktop: visible mpv video under the transparent WebView, caption hit-testing, bridge and normal shutdown. Separate-profile UI check verified 0.5.0 About, automatic-check preference persistence across restart, native manual-check dialog and exit 0. Owned-window screenshots were inspected.
- Metadata, preloading, performance scheduling, desktop adapters, subtitles, playback/stream selection, settings, search, guest access, artwork and security suites passed on the integrated source.
- ZIP integrity, safe entry paths, absence of .env/private runtime caches, packaged native hash and actual signed update metadata verified. Package hashes are in `SHA256SUMS.txt` and `build-manifest.json`.

## Validation corrections

The inherited idle fixture sampled immediately after seek, before pending state-flush work had settled. It failed one of five unmodified reruns (one or two wakeups). It now requires a bounded quiet period before retaining the original strict idle assertion; all five corrected runs measured zero wakeups. This change is confined to `#[cfg(test)]`; the production player source preceding the test module is unchanged.

The window smoke test still probed the old caption size. It now derives the maximize-button center from the shipping native geometry instead of a hard-coded coordinate. The corrected native check passed.

The initial preview test invocation used a three-second web fixture despite seeking beyond 3.2/4.5 seconds. It was rerun with an eight-second H.264 fixture with keyframes every two seconds; all preview/cache/fallback checks passed. To reproduce the test media:

```sh
ffmpeg -f lavfi -i testsrc2=size=320x180:rate=30 -t 8 -c:v libx264 -pix_fmt yuv420p -g 60 -keyint_min 60 -sc_threshold 0 -movflags +faststart native-validation-8s.mp4
```

The subsequent source commit changes only validation code/documentation. The packaged runtime and frontend remain the verified production build from `e03939c`.

## Deliberate limits

This is a local Windows build. The update feed is held unpublished per the user's instruction, so a live manual GitHub check reports a fetch error; successful download verification was exercised with the controlled signed fixture server. No production GitHub-to-installed-app update is claimed. The existing 0.4.1 installation was retained; QA used a separate copy/profile. No macOS/mobile packages, new FPS/HDR claims or blur experiments were produced.
