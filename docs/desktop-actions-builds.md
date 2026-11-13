# Manual desktop builds on GitHub Actions

Use **Build desktop installers** in the repository's Actions tab. Select
**Run workflow**, then choose `all`, `macos`, or `windows`.
The workflow builds macOS Apple silicon and Windows x64 packages from source.
It uses standard GitHub-hosted `macos-15` and `windows-2025` runners.
It does not use Blacksmith or publish a release.

Standard GitHub-hosted runner compute is free for public repositories.
Artifact storage still has limits. These build artifacts expire after one day.
See [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
and [hosted runner specifications](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

## Build from a fork

1. Fork the repository, or sync an existing fork with the latest `main`.
2. Open the fork's **Actions** tab and enable workflows if GitHub asks.
3. Select **Build desktop installers**, then **Run workflow**.
4. Select the platforms and wait for the jobs to complete.
5. Open the completed run and download its artifacts within one day.

The workflow must be present on the fork's default branch for the manual run
button to appear. No repository secrets or upstream signing keys are required.
Any applicable usage belongs to the repository owner's account. Another fork
under the same account does not reset that account's allowance.

Each artifact contains a macOS app ZIP, or a Windows installer and portable ZIP.
It also contains `SHA256SUMS` and a build manifest. Send these files together.
Keep the original package files intact when sharing them.

## Package behavior

Each job clears generated `.next`, `dist`, and `build` output before it builds.
Source assets remain intact. It checks version metadata and basic regressions,
downloads checksum-verified playback libraries, and builds the frontend and
native runtime. It checks the packaged frontend, native version and checksums.
It does not run interactive playback tests.

The macOS app has an ad hoc signature and is not notarized. Windows packages
have no publisher signature. Platform security warnings can appear.
These packages do not include a newly signed update feed and are intended for
manual installation. They retain the app's configured official update channel.
Official release signing keys stay outside forks.

The separate **Desktop playback** workflow uses Blacksmith runners and is not
required for these manual package builds.
