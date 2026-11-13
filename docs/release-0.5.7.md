# Navigator 0.5.7

Navigator 0.5.7 supports Windows and macOS. This update fixes the first Ask Navigator click leaving desktop fullscreen and adds small visual improvements.

### New features and improvements

- **Navigator stays in fullscreen:** Opening Ask Navigator for the first time keeps the Windows or macOS app in fullscreen. Later opens and the keyboard shortcut follow the same behavior.
- **Consistent emerald backgrounds:** Add-ons and Settings use the same emerald palette as the home page, with matching dot styling.
- **Softer avatar menu shadow:** The avatar dropdown has a lighter shadow in light mode.

### Windows installation

Requires **Windows 11 on an x64 PC**.

Download and run the installer. Installed versions with in-app update support can update through Navigator after this release is published to the signed update feed. Portable ZIP copies require manual updates.

The installer does not have a Windows publisher signature. In-app updates use cryptographic signatures to verify downloads.

### macOS installation

Requires **Apple Silicon and macOS 13.5 or later**.

Extract the app ZIP and move Navigator to Applications. Navigator 0.5.3 and later can update in the app after this release is published to the signed update feed. Versions through 0.5.2 require a manual upgrade to enable in-app updates.

This build uses an ad hoc signature and is not notarized by Apple. macOS may require approval before you can open it. In-app updates use cryptographic signatures to verify downloads.

### Checks completed

First and later Navigator opens, fullscreen keyboard shortcuts, player controls, desktop adapters and Navigator regression checks passed. TypeScript passed.
