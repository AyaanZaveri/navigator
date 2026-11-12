# Navigator 0.5.4

Navigator 0.5.4 is available for Windows and macOS. This update improves keyboard seeking, adds poster colors to search, and reuses loaded subtitles in Ask Navigator.

### New features and improvements

- **Smooth keyboard scrubbing:** Tap Left or Right to skip five seconds. Hold a key to move smoothly through the timeline at 40 video seconds per second. Release it to play from the selected position. Paused videos stay paused.
- **Clearer progress bar:** The progress bar becomes taller while scrubbing. The extra scrub dot has been removed.
- **Reliable arrow keys:** Seeking works after clicking the progress bar. Repeated keys use the latest seek position instead of replaying the same section.
- **Search colors:** The background takes its colors from the first poster in All, Movies, or TV Shows. Colors stay continuous when moving between Home and Search.
- **Subtitle reuse:** Ask Navigator can reuse subtitles already loaded for the current movie or episode. It avoids duplicate downloads and respects subtitle timing offsets. Automatic subtitle selection prefers SDH captions within your chosen language and subtitle mode.

### Windows installation

Requires **Windows 11 on an x64 PC**.

Download and run the installer. Installed versions with in-app update support can update through Navigator. Older versions require a manual installation. Portable ZIP copies require manual updates.

The update uses the existing Navigator profile for sign-in and settings.

The installer does not have a Windows publisher signature. In-app updates use cryptographic signatures to verify downloads.

### macOS installation

Requires **Apple Silicon and macOS 13.5 or later**.

Open the DMG and drag Navigator into Applications. A ZIP download is also available. Navigator 0.5.3 and later can update in the app. Versions through 0.5.2 require a manual upgrade to enable in-app updates.

The update uses the existing Navigator profile for sign-in and settings.

This build uses an ad hoc signature and is not notarized by Apple. macOS may require approval before you can open it. In-app updates use cryptographic signatures to verify downloads.

### Checks completed

Keyboard seeking and scrubbing, search colors, subtitle reuse, desktop adapters, and update-signature regression checks passed. TypeScript, native tests, frontend and native production builds, package versions, archive integrity, and signed update files were verified on both platforms.
