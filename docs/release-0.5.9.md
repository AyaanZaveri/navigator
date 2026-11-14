# Navigator 0.5.9

Navigator 0.5.9 supports Windows and macOS. This update improves desktop setup, Windows installation, and interface consistency.

### New features and improvements

- **More time for Windows updates:** Installation allows up to 90 seconds for the local server to start. Failed preparation keeps the previous installation and records clearer timeout details.
- **Stable macOS card hover:** Continue Watching backdrops stay still on hover to avoid zoom-related layer changes. The Play action and hover dimming remain available.
- **TMDB setup guidance:** Signed-in desktop users without a TMDB token see a dismissible prompt with a direct link to its settings. The prompt appears once per app session and closes after a token is saved.
- **Matching header buttons:** Update available uses the same size and styling as Sign in.
- **Cleaner Settings headings:** Page titles no longer show an outline when focus moves after navigation. Interactive controls retain their keyboard focus indicators.

### Windows installation

Requires **Windows 11 on an x64 PC**.

Download and run the installer. Installed versions with in-app update support can update through Navigator. Portable ZIP copies require manual updates.

The installer does not have a Windows publisher signature. In-app updates use cryptographic signatures to verify downloads.

### macOS installation

Requires **Apple Silicon and macOS 13.5 or later**.

Extract the app ZIP and move Navigator to Applications. Navigator 0.5.3 and later can update in the app. Versions through 0.5.2 require a manual upgrade to enable in-app updates.

This build uses an ad hoc signature and is not notarized by Apple. macOS may require approval before you can open it. In-app updates use cryptographic signatures to verify downloads.

### Checks completed

Desktop, updater, installation-readiness, card interaction, Settings navigation, and TMDB setup regression checks passed. TypeScript, frontend and native production builds passed. Packaged versions, archive integrity, checksums, and both platform update signatures were verified.
