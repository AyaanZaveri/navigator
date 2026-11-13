# Navigator 0.5.6

Navigator 0.5.6 is available for Windows and macOS. This update makes available app updates easier to find.

### New features and improvements

- **Update available button:** Navigator silently checks for updates when the desktop app opens and once each hour when automatic checks are enabled. A button appears beside the avatar only when a newer version is available. Select it to open the updater and download the update.
- **Quiet background checks:** Background checks do not open update dialogs. You can still check manually in Settings or turn automatic checks off.
- **Keyboard scrubbing polish:** The progress fill keeps its rounded edge while you scrub with the keyboard.

### Windows installation

Requires **Windows 11 on an x64 PC**.

Download and run the installer. Installed versions with in-app update support can update through Navigator. Portable ZIP copies require manual updates.

The installer does not have a Windows publisher signature. In-app updates use cryptographic signatures to verify downloads.

### macOS installation

Requires **Apple Silicon and macOS 13.5 or later**.

Extract the app ZIP and move Navigator to Applications. Navigator 0.5.3 and later can update in the app. Versions through 0.5.2 require a manual upgrade to enable in-app updates.

This build uses an ad hoc signature and is not notarized by Apple. macOS may require approval before you can open it. In-app updates use cryptographic signatures to verify downloads.

### Checks completed

Desktop adapter, Navigator, update behavior, update-signature and package-validation regression checks passed. Frontend and native production builds, packaged version metadata, archive integrity and signed update files were verified on both platforms.
