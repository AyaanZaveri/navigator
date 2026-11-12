# Navigator 0.5.5

Navigator 0.5.5 is available for Windows and macOS. This update adds infinite search scrolling and faster keyboard seeking.

### New features and improvements

- **Infinite search scrolling:** More titles load as you approach the bottom of search results. All, Movies, and TV Shows retain their loaded results when you switch filters. Failed requests can retry without clearing the grid.
- **Faster keyboard seeking:** Tap an arrow key to skip ten seconds. Hold it for smooth scrubbing that starts at 60 video seconds per second and increases to 120 over two seconds. Release the key to play from the selected position. Paused videos stay paused.
- **Consistent seek controls:** The progress bar and skip buttons use the same ten-second step. Direction changes restart the hold acceleration for better control.

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

Infinite search loading, filter caches, retry behavior, keyboard seeking and scrubbing, desktop adapters, and update-signature regression checks passed. TypeScript, native tests, frontend and native production builds, packaged app versions, archive integrity, and signed update files were verified on both platforms.
