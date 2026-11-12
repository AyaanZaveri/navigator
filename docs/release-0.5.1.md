# Navigator 0.5.1

Navigator 0.5.1 improves Windows HDR output and makes the player controls more consistent on Windows and macOS.

### New features and improvements

- **Windows HDR output:** HDR video now uses 10-bit HDR10 output on HDR-enabled displays. SDR video keeps SDR output. Navigator adjusts the output when the source or display changes.
- **New Windows icon:** The updated icon is included in the app, installer, Start menu shortcut and installed-app entry. Small icon sizes are clearer at common display scales.
- **Navigator player button:** The button is square and matches the other player controls. Click it again to close the panel.
- **Keyboard hints:** Player tooltips show clearer shortcut keys on Windows and macOS.
- **Update indicator:** The Windows update button appears only when an update is available. It sits beside the account button and matches the search bar height.

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

Native builds, frontend production builds, TypeScript checks, basic regression checks and package integrity checks passed.
