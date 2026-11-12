# Navigator 0.5.0

Navigator 0.5.0 is available for Windows and macOS. This release adds in-app updates on Windows and improves browsing, artwork, and playback.

### New features and improvements

- **Windows updates:** Check for updates from the header or **Settings → About**. You can enable automatic checks and install updates through Navigator.
- **Continue Watching:** Navigator prepares titles in the background to help playback start sooner. You can control this feature in Settings.
- **Title details:** Navigator loads and reuses movie and episode details to reduce loading time.
- **Home and search:** Home rows load separately. Search navigation and result changes respond faster.
- **Episode artwork:** Episode backgrounds load sharper images when available.
- **Metadata:** Release years, series year ranges, and missing provider details are handled more accurately.
- **Controls:** Watched status changes appear immediately. Subtitle selection responds faster. Add-on removal gives clearer feedback.

This release also includes the native playback and preview cache improvements from 0.4.1.

### Windows installation

Requires **Windows 11 on an x64 PC**.

Install 0.5.0 with the Windows installer to enable in-app updates. Future releases can then be installed through Navigator.

The installer sets up WebView2 if needed. Portable ZIP copies require manual updates.

The installer does not have a publisher signature. In-app updates use cryptographic signatures to verify downloads.

### macOS installation

Requires **Apple Silicon and macOS 13.5 or later**.

Open the DMG and drag Navigator into Applications. A ZIP download is also available.

This build uses an ad hoc signature and is not notarized by Apple. macOS may require approval before you can open it.

macOS updates require manual installation.

Your existing sign-in and settings are preserved on both platforms.

### Checks completed

Both builds passed production builds, package checks, and native playback and preview tests.

Interactive playback and HDR output were not tested on macOS for this release.
