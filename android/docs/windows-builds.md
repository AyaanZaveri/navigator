# Android builds on the Zenbook

Android APK builds run on the user's Windows Zenbook over the existing SSH alias
`navigator-windows`. Do not use GitHub Actions for builds. This is separate from
the Windows desktop app build and does not require Rust, Visual Studio or NSIS.

## Verified setup (2026-11-02)

The existing installation was sufficient; no SDK or JDK installation was needed:

- `JAVA_HOME`: `C:\Program Files\Java\jdk-17` (17.0.12).
- `ANDROID_HOME`: `C:\Users\amanz\AppData\Local\Android\Sdk`.
- Android Platform 36 and Build Tools 35.0.0/36.0.0 are installed.
- The project wrapper pins Gradle 8.13 and verifies its distribution checksum.
- Kotlin 2.3.21, AGP 8.13.2 and Media3 1.11.1 remain project dependencies.

Tool inventories can change; verify paths before the next build. Keep SSH keys
on the Mac. GitHub authentication is not required on Windows: transfer a source
archive from a clean, committed revision, then publish its verified APK through
the Mac's existing GitHub CLI authentication.

## Build and verify

1. Confirm the source commit and a clean worktree. Make an archive from that
   commit, rather than copying unrelated working-directory changes. Transfer
   only tracked Android sources, including the public development keystore.
2. Compare the source archive's SHA-256 on both machines. Extract to a separate
   directory under `C:\Users\amanz\Code`, preserving the desktop checkout.
3. Run PowerShell over `ssh navigator-windows`. Select the configured JDK,
   enter the extracted `android` directory, and run:

   ```powershell
   $env:Path = "$env:JAVA_HOME\bin;" + $env:Path
   .\gradlew.bat --no-daemon compileDebugKotlin testDebugUnitTest lintDebug assembleDebug --console=plain
   if ($LASTEXITCODE -ne 0) { throw 'Android build failed' }

   & "$env:ANDROID_HOME\build-tools\36.0.0\apksigner.bat" verify --verbose --print-certs app\build\outputs\apk\debug\app-debug.apk
   if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
   ```

4. Check the manifest/package, test XML reports, lint results, signing
   certificate and APK checksum. After copying the APK back, compare SHA-256
   again and inspect its ZIP integrity and packaged bridge assets against the
   source commit. Never publish an artifact from a failed build.
5. Publish the direct `.apk`, checksum file and build metadata as a GitHub
   prerelease targeting the exact source commit. This does not merge the PR.
   The APK is signed for testing using the repository's public development key;
   it is not a production store-signing identity.

The website remains hosted at the configured HTTPS origin. No web build or Node
server is required on the build computer. An APK build verifies packaging, not
physical-device video/HDR, gestures, network performance or battery behavior.

## Kotlin migration build record

- Source: `d04c169e65a783ba2a72c5ce2c207540764ace66` from PR #7.
- Source archive SHA-256: `1cbfdf3b8acf5d6ebc246ccf661190616c80aaf165da10f463857fb58a25f6e0`.
- Source/build/artifact directory:
  `C:\Users\amanz\Code\navigator-android-kotlin-d04c169`.
- Logs: `C:\Users\amanz\navigator-build-tools\android-kotlin-d04c169`.
- Build entry point retained on Windows:
  `C:\Users\amanz\navigator-android-build.ps1`.
- Artifact: `dist\Navigator-Android-Kotlin-d04c169.apk` (6,918,175 bytes).
- APK SHA-256: `e53d0e852bb5162b829add2714794235b3647bfedf69f1dcfeda9620591c5c78`.
- Application ID: `app.navigator.android`; version code `29894572`.
- Signature check: `signature-verification.txt` in the logs directory.
- [GitHub prerelease and SHA-256/build metadata](https://github.com/AyaanZaveri/navigator/releases/tag/android-kotlin-20261102-d04c169).

The migration's 46 Android tests, lint and signed APK assembly passed on Windows.
The certificate SHA-256 matches the checked-in development key:
`42750b0c8bed4c03fc4340a79247dd2627029c0c6e27ee3a115bc76950e5e1be`.
Packaged bridge assets and the new Kotlin state-relay classes were checked after
transfer. No physical device or emulator playback validation was performed.

## Official references

- [Android SDK manager/package installation](https://developer.android.com/tools/sdkmanager)
- [Android SDK platform requirements and releases](https://developer.android.com/tools/releases/platforms)
- [APK signature verification](https://developer.android.com/tools/apksigner)
