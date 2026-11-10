Navigator 0.4.1 fixes Windows installation preparation.

- Check the actual guest entry page when preparing the installed local server.
- Stop treating the intentional `/login` redirect as a startup failure.
- Include the last HTTP status in readiness-timeout diagnostics.
- Add a regression check covering login redirects, unhealthy responses and probe-process cleanup.

Includes all playback, preview-cache, subtitle, chapter and interface improvements from 0.4.0. The frontend is reused from the validated 0.4.0 build with updated version metadata; both native executables are rebuilt for 0.4.1. Windows builds run exclusively on the Zenbook over SSH.

If 0.4.0 stopped with “Navigator could not finish preparing its files”, close the old setup window and run the 0.4.1 installer. Sign-in and settings are preserved.

Downloads include Windows setup and portable ZIP, macOS DMG and app ZIP, source archive, manifest and SHA-256 checksums. macOS requires Apple silicon and macOS 13.5 or later; its app is ad hoc signed and not notarized. Windows requires Windows 11 x64 with WebView2; the installer is unsigned.
