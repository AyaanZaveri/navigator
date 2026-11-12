# Navigator 0.5.2

Navigator 0.5.2 is available for Windows and macOS. This update fixes mouse selection in Windows search suggestions.

### New features and improvements

- **Windows search suggestions:** Click a suggestion or its artwork to open the title. Navigator no longer treats these clicks as window-drag actions. Arrow keys and Enter still work.

### Windows installation

Requires **Windows 11 on an x64 PC**.

Use the installer or update through Navigator. Portable ZIP copies require manual updates.

The installer does not have a publisher signature. In-app updates use cryptographic signatures to verify downloads.

### macOS installation

Requires **Apple Silicon and macOS 13.5 or later**.

Open the DMG and drag Navigator into Applications. A ZIP download is also available. macOS updates require manual installation.

This build uses an ad hoc signature and is not notarized by Apple. macOS may require approval before you can open it.

Your existing sign-in and settings are preserved on both platforms.

### Checks completed

Search-click and window-drag regression checks, desktop bridge checks, TypeScript checks, native and frontend production builds, and package integrity checks passed.
