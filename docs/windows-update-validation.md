# Windows updater validation — 2026-11-11

Implemented on `windows-in-app-updates`, in `/tmp/navigator-windows-updater`, and selectively mirrored into the main working tree without staging or replacing concurrent edits. All Windows compilation and packaging ran on the Zenbook over `ssh navigator-windows`; no Windows CI or Mac cross-build was used.

The checkout is version **0.3.6**, while the installed/released Windows app is **0.4.1**. The candidate is for QA only and was not installed or published. The 0.4.1 guest-entry preparation fix and its existing regression test were carried over explicitly; this branch does not claim to contain every other change on the separate 0.4.1 release branch.

## Passed checks

- Production frontend build and TypeScript on Windows; TypeScript and targeted UI/bridge/settings checks on the Mac and mirrored working tree.
- Native regression suite: **15 passed**, seven optional/fixture tests ignored by the default run. The updater's ignored integration fixture was separately executed for all nine cases below.
- Real WinSparkle DLL: empty feed, equal installed version, older release, valid signed download, same-size tampering, missing signature, wrong signing key, missing feed and malformed feed. Verification uses ephemeral keys and an HTTP fixture server. A test-only callback intercepts installer execution **after** signature verification.
- Actual NSIS source with isolated product identity: unrelated populated directory refused; verified staged replacement; failed preparation retaining the previous app; interrupted backup preserved; prior staging directory preserved; silent update relaunch.
- Shipped guest-entry readiness regression: intentional login redirect, unhealthy service and owned-process cleanup. The actual packaged runtime's `--prepare-install` also returned **0**.
- Native desktop UI in the signed-in Zenbook session: guest header link → About; automatic checks disabled and saved; app closed/restarted; disabled preference retained; automatic checks re-enabled; manual check opened an owned native WinSparkle dialog; normal exit **0**. About and native-dialog screenshots were inspected.
- Installed 0.4.1 executable hash, registry version and frontend Build ID remained unchanged. No owned QA process remained, and the temporary scheduled task was removed.

## What the desktop check establishes

The packaged UI ran from a separate QA copy, using a non-executable installation marker, a separate profile and port 37382. The real installation and its sign-in/settings were not opened by the candidate.

The new public GitHub feed has **not been published**. The real manual GitHub check therefore displayed the expected update-fetch error. Successful download/signature verification was tested through the controlled server; installer replacement/relaunch was tested separately. A live production GitHub release → installed-app upgrade was not performed or claimed.

The next Windows release must incorporate this feature into the intended release source, use a new version above 0.4.1, publish the exact signed installer, then publish its generated feed. Existing installations need one manual bootstrap installation to obtain the updater. See [Windows update publishing](windows-updates.md).

## Retained evidence on Zenbook

Workspace: `C:\Users\amanz\Code\navigator-releases\windows-updater-20261111`.

Under `C:\Users\amanz\navigator-build-tools`:

- `windows-updater-smoke.json`: nine real-DLL cases.
- `updater-ui.json`, `updater-ui.about.png`, `updater-ui.after-check.png`, `updater-ui.dialog.png`: native UI results and screenshots.
- `windows-updater-final-check.json`: installed-version preservation and process/task cleanup.
- `windows-updater-build-manifest.json`: final candidate digests, Build ID and archive checks.
- `windows-updater-candidate-appcast.xml`: signed QA candidate metadata; not published.

The immutable distribution ZIP was created from the clean packaging folder. Native UI tests used a separate copy. Private signing material is outside source and package directories.
