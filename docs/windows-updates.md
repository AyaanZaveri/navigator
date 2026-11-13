# Windows in-app updates

Navigator's installed Windows x64 app uses WinSparkle 0.9.4. A header update button is also available before sign-in. Only `/settings/about` is public; connection, playback and other settings pages retain their authentication gate. Settings → About contains the installed native version, an automatic-check preference and a manual check button. WinSparkle presents download progress and requires the user to accept installation. The shutdown callback goes through the normal window/player/backend shutdown path. The preparation probe retains the shipped 0.4.1 guest-entry readiness fix (an intentional `/login` redirect is not a failure). The NSIS update waits for shutdown, prepares an adjacent staging directory, preserves the old installation until replacement and relaunches after success.

Portable ZIPs, development URLs and native compositor smoke fixtures do not initialize the updater. Web/macOS/iOS/Android have no update commands enabled by this feature. The automatic-check preference is local to the Windows profile and defaults to enabled. The native shell silently checks the fixed appcast on launch and hourly. Its bounded, read-only probe recognizes the generated Windows x64 enclosure and compares numeric release versions. It never downloads or executes the installer. WinSparkle's automatic scheduler is disabled because even its `without_ui` check can show an update window. Disabling automatic checks leaves manual checks available.

The header shows “Update available” immediately left of the avatar only after a newer release is found. The button opens WinSparkle directly, without visiting Settings. WinSparkle confirms the download, verifies the signature and presents its install controls. A failed background probe shows no button or error dialog. This availability hint does not replace WinSparkle's signature verification.

## Trust and distribution

- Feed: `https://raw.githubusercontent.com/AyaanZaveri/navigator/main/updates/windows.xml`.
- Packages: public GitHub release assets under `AyaanZaveri/navigator`.
- Every update installer must have an Ed25519 signature. Its public key is compiled into the native shell from `desktop/windows/update-public-key.txt`. The private key must never be committed, copied into an app package or uploaded to GitHub.
- The pinned WinSparkle ZIP and extracted x64 DLL both have SHA256 checks in `scripts/fetch-winsparkle.mjs`. Its license notices are packaged alongside the application. The installer manifest also covers the updater DLL.
- This feature does not add Windows Authenticode signing. Ed25519 update verification and Windows publisher identity are separate mechanisms.
- No arbitrary URL, installer path, release command or signing key is accepted from the renderer. The existing origin gate and strict IPC parser also apply to update requests.

The initial bootstrap build must be installed manually. Previously installed versions have no updater. The empty initial feed intentionally advertises no update until a tested, signed installer is published. An unpublished feed produces a visible check error, never an unverified installation.

## Publishing a Windows update

1. Build **only on the Zenbook** over the existing `ssh navigator-windows` connection. Use a clean release snapshot and the ordinary `desktop:package` process. Never build Windows in GitHub Actions or Blacksmith.
2. To generate the appcast during packaging, set both `NAVIGATOR_UPDATE_SIGNING_KEY` (private PEM path on the build computer) and `NAVIGATOR_RELEASE_TAG` (the final GitHub release tag). The protected key initialized for this project is at `%USERPROFILE%\.navigator-signing\windows-ed25519.pem` on the Zenbook. Back it up securely; losing it breaks the existing clients' trust chain.
3. Alternatively, after packaging, run:

   ```powershell
   node scripts/windows-update-feed.mjs dist/Navigator-0.3.7-windows-x64-setup.exe 0.3.7 windows-v0.3.7 "$env:USERPROFILE\.navigator-signing\windows-ed25519.pem" dist/windows.xml
   ```

4. Upload and publish the **exact signed installer bytes** to that GitHub tag. Verify the uploaded SHA256 and size. Never repackage/re-sign the installer after generating the appcast without regenerating its signature.
5. Test an actual older installed build → candidate update on the Zenbook. Preserve sign-in/settings; verify shutdown, restart, native version, frontend Build ID and removal of obsolete chunks. Do not treat a locked desktop or `-NoCapture` run as visual confirmation.
6. Only after the asset exists and is validated, replace `updates/windows.xml` on `main` with the generated appcast. Commit/push that feed through the normal release review. No GitHub API token is shipped to users. A GitHub prerelease is offered only if deliberately included in this stable feed; `/releases/latest` is not used, so a macOS-only release cannot accidentally replace the Windows target.

Publish an incremented numeric version; never reuse the installed version for a new advertised build. macOS updater integration and delta packages are separate future work.

## Validation

Run TypeScript plus:

```sh
node scripts/test-app-updates.cjs
node scripts/test-windows-update-feed.mjs
node scripts/test-settings-navigation.cjs
node scripts/test-desktop.cjs
node scripts/test-windows-install.cjs
node scripts/test-windows-install-readiness.cjs
node scripts/test-windows-package.mjs
```

On the Zenbook:

```powershell
$env:RUSTFLAGS='-C target-feature=+crt-static'
cargo test --manifest-path desktop/Cargo.toml --target x86_64-pc-windows-msvc --release --locked
node scripts/windows-updater-smoke.mjs
powershell -NoProfile -File scripts/windows-updater-install-smoke.ps1
```

The native DLL fixture test uses an ephemeral loopback server and ephemeral signing keys. Production code has no feed/key override. It checks an older version, a valid signed download, tampering, missing signatures, an incorrect key, and missing/malformed feeds. A test-only callback intercepts payload execution **after** WinSparkle signature verification. This establishes download verification, not a visual/end-to-end production GitHub update claim.

The installer fixture compiles the actual NSIS source with only registry/shortcut/window-class identity substitutions and a tiny preparation executable. It exercises complete replacement, failed preparation preservation, retained interrupted backups, and update relaunch without altering the real Navigator installation or profile.

For a packaged-app UI check without opening or changing the installed app’s profile, use a separate extracted QA copy and `navigator-desktop.exe --profile <qa-profile-path> --port 37382`. This CLI option does not change the normal profile location. Do not repack a distribution after running it with real sign-in data.

## Recovery boundaries

A populated target must contain the Navigator executable, uninstaller and resources before whole-directory replacement is allowed. Unrelated populated folders and prior staging folders are left untouched. A preparation/extraction failure leaves the existing installed folder untouched. A failed activation attempts to restore the prior folder. An interrupted backup is retained at `<InstallDir>.update-backup`; a later installer refuses to delete it automatically and reports recovery is needed. This is not automatic rollback after a newly installed app crashes or fails its first ordinary launch. User profile data remains outside the replaced installation tree.
