Navigator 0.4.0 for Windows and macOS.

- Share a bounded, local memory cache between native playback and seek previews so new previews can reuse downloaded video bytes.
- Reuse generated preview images across the same keyframe interval and combine duplicate hover requests.
- Keep preview indexing off the initial playback-ready path.
- Start resumed native playback at the saved position before decoding the opening frame.
- Avoid duplicate resume seeks, preserve fresh starts, and retain compatibility with older native runtimes.
- Resolve playback IDs and load add-on lists in parallel.
- Select a preferred-language native stream earlier once higher-priority add-ons have settled.
- Preserve language preferences, add-on priority, exclusions and URL deduplication during early selection.
- Fetch subtitles alongside stream discovery and reuse preloaded subtitle files.
- Cancel abandoned upstream add-on requests.
- Show actual buffered ranges, including gaps after resuming or seeking.
- Show embedded chapters on the seek bar and in hover previews.
- Keep chapter preview cards compact with clearer text spacing.
- Highlight intro, recap and credits ranges on the progress bar.
- Round skip-range highlights, bound chapter labels, and leave clean gaps between timeline segments.
- Add a subtle shimmer to the player loading status.
- Extend subtitle-menu dividers to the edges.
- Remove the cast popover from player controls.
- Add searchable OpenRouter and Groq model catalogs with model-family icons, cached results and stale-request cancellation.
- Align the account drawer with the sign-in drawer and match their mobile styling.
- Use a square, icon-only sign-in button on mobile.
- Improve mobile settings headings, spacing and Android edge-to-edge alignment.
- Remove the 480p stream-filter option.
- Include sourced ratings on guest title and episode pages.
- Keep idle native playback cursors hidden on Windows and macOS; movement, menus and dialogs restore the pointer as appropriate.
- Coalesce macOS render callbacks and schedule future frame targets while retaining mpv's timing guard.
- Replace fixed native idle polling with event-driven wakeups and bounded state-delivery deadlines.
- Add native playback-phase timing and actual decoder diagnostics.
- Refresh the bundled mpv/FFmpeg libraries from the tested AIOStreams distribution.
- Expand regression coverage for resume, previews, shared byte caching, ranges, chapters, subtitles, selection and cancellation.

The list covers changes committed since the 0.3.6 release snapshot, including small UI changes and fixes that were already present in its selectively assembled source.

Downloads include the Windows installer and portable ZIP, macOS DMG and app ZIP, source archive, build manifest, and SHA-256 checksums.

The shared media-byte cache uses up to 64 MiB of local RAM per playing file, with no cloud storage or database. It applies to supported HTTP file streams; HLS/DASH and extensionless URLs retain direct playback. Evicted bytes can require a refetch. Playback takes priority, and an incompatible local source falls back to direct playback with position, headers and pause preserved.

Both native executables and the frontend are rebuilt for 0.4.0. Windows builds run exclusively on the Zenbook over SSH. Actual-library tests on macOS and Windows verify playback plus two new preview frames using one download, authenticated requests, resume and direct fallback. Interactive packaged playback, sustained throughput, HDR output and physical frame presentation are not benchmarked by those tests.

macOS requires Apple silicon and macOS 13.5 or later. The macOS app is ad hoc signed and not notarized. The Windows installer is unsigned and requires Windows 11 x64 with WebView2.
