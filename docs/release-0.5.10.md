# Navigator 0.5.10

Navigator 0.5.10 supports Windows and macOS. This patch restores hover zoom on macOS Continue Watching cards.

### New features and improvements

- **Continue Watching hover zoom:** macOS Continue Watching cards use the same subtle zoom as poster cards. Backdrop dimming, logos, and the Play action remain in place. Reduced-motion preferences are respected.

### Windows installation

Requires **Windows 11 on an x64 PC**.

Download and run the installer. Installed versions with in-app update support can update through Navigator. Portable ZIP copies require manual updates.

The installer does not have a Windows publisher signature. In-app updates use cryptographic signatures to verify downloads.

### macOS installation

Requires **Apple Silicon and macOS 13.5 or later**.

Extract the app ZIP and move Navigator to Applications. Navigator 0.5.3 and later can update in the app. Versions through 0.5.2 require a manual upgrade to enable in-app updates.

This build uses an ad hoc signature and is not notarized by Apple. macOS may require approval before you can open it. In-app updates use cryptographic signatures to verify downloads.

### Checks completed

Card hover, interaction, desktop, updater, and installation-readiness regression checks passed. TypeScript, frontend and native production builds passed. Packaged versions, archive integrity, checksums, and both platform update signatures were verified.
