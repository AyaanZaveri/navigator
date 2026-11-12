# Navigator 0.5.3

Navigator 0.5.3 is a macOS update. It adds in-app updates through Sparkle and improves the GitHub release button.

### New features and improvements

- **macOS in-app updates:** Check for new releases in Settings → About. Sparkle downloads and verifies signed updates, then lets you choose when to install and restart.
- **Background update checks:** Turn automatic checks on or off in Settings → About. The header shows an update button only when a new version is available.
- **GitHub release button:** The About section now has a ghost button with the GitHub icon. It replaces the underlined link.

### macOS installation

Requires **Apple Silicon and macOS 13.5 or later**.

Download the DMG, open it and drag Navigator into Applications. A ZIP download is also available.

Versions through 0.5.2 need this one manual upgrade to enable macOS in-app updates. Later signed releases can update Navigator directly in the app.

Your existing sign-in and settings are preserved. Navigator stops playback and its local server before an update restarts the app.

This build uses an ad hoc signature and is not notarized by Apple. macOS may require approval before you can open it. In-app updates use cryptographic signatures to verify downloads.

### Checks completed

TypeScript, update controls, desktop bridge, signature and update-status regression checks passed. The macOS production build, app and framework signatures, DMG and ZIP integrity, and signed update archive were verified.
