# Cloudflare Workers deployment

Navigator can run on Cloudflare Workers through the OpenNext adapter while
retaining its normal Vercel deployment. This is a full Next.js deployment:
server-rendered routes, API handlers, cookies, Server Actions and streaming chat
remain server-side. It is not a static export or a proxy to Vercel.

## Configuration

- Worker name: `navigator-strm`.
- Selected URL: `https://navigator-strm.ayaanzaveri08.workers.dev`.
- Adapter: `@opennextjs/cloudflare` 1.20.15 with Wrangler 4.156.2.
- Next.js/eslint-config-next: 16.4.4. The current adapter's peer dependency
  requires Next.js 16.4.1 or newer; the previous 16.1.6 is outside that range.
- Compatibility date: 2026-11-02, with `nodejs_compat` and
  `global_fetch_strictly_public`.
- Next.js 16.4 requires TypeScript bundler module resolution. Media Chrome
  imports use its public exports so both the runtime and types resolve.
- Cloudflare uses an explicit Webpack build command in `open-next.config.ts`.
  The ordinary `build` script and standalone output for Vercel/desktop remain.
- Static assets come from `.open-next/assets`. Only immutable Next.js asset
  paths receive long-lived public caching through `public/_headers`.

The initial configuration uses OpenNext's default dummy incremental/tag cache
and requires no R2 bucket, KV namespace or Durable Object. Authenticated pages
must not be stored in a public response cache. Persistent ISR/data-cache storage
can be configured separately if it becomes necessary.

## Build and deploy

Use Node.js 22 or newer. Install dependencies with the checked-in Bun lockfile:

```sh
bun install --frozen-lockfile
bun run cloudflare:build
```

The production output is `.open-next/worker.js` with its adjacent generated
modules/assets. It is ignored by Git. `next.config.ts` is still the normal
standalone configuration; do not change it to `output: 'export'`.

To build and deploy in one command on a machine authenticated to the intended
Cloudflare account:

```sh
bun run cloudflare:deploy
```

For an existing verified build, Wrangler can upload the output directly. Verify
the account with `wrangler whoami` first, and set `CLOUDFLARE_ACCOUNT_ID` to the
intended account when deploying non-interactively.

```sh
npx wrangler deploy --config wrangler.jsonc --no-autoconfig --secrets-file /path/to/protected-worker-secrets.json
```

The secrets file is a protected temporary JSON file outside the repository. It
contains the deployment's server-only TMDB settings, not browser cookies or
Stremio session tokens. Avoid dotenv interpolation and never put secret values
in Wrangler `vars`, command-line `--var` arguments or client-side configuration.
For this account, the production Vercel project exposes these server settings:

- `TMDB_API_READ_ACCESS_TOKEN`
- `TMDB_API_KEY`

User-supplied AI/provider settings remain part of the existing application flow.
A new hostname has a separate cookie/session scope, so sign in and configure
browser-specific provider settings there as needed.

## Domain and native apps

`navigator-strm.vercel.app` is a Vercel-owned hostname and cannot be assigned to a
Cloudflare Worker. The selected Cloudflare hostname preserves `navigator-strm`
under this account's `workers.dev` namespace. An owned custom domain could be
added later. The existing Vercel hostname remains a separate deployment.

The mobile apps load their configured HTTPS server. Adding this deployment does
not change their default server or require a native build; choose the Cloudflare
origin in the app's server settings to use it.

## Verification

After deploying, run the public HTTP smoke checks (they make no AI provider calls):

```sh
node scripts/test-deployment-http.mjs https://navigator-strm.ayaanzaveri08.workers.dev
```

These verify rendered login HTML and static assets, unauthenticated API rejection,
empty anonymous addon results, invalid-login validation, the legacy episode
redirect and TMDB artwork responses. Confirm that authenticated/dynamic responses are not publicly
cached. Device playback and a signed-in Ask Navigator request still require
application-level testing with the user's account/provider configuration.

GitHub Actions are not needed for this deployment and remain disabled. The
initial heavy build is run on the Zenbook over SSH; credentials used to upload
the Worker stay on the Mac.

## Initial build validation

The initial OpenNext build completed on the Zenbook with Node.js 22.13.1 and
Bun 1.3.10. TypeScript, page-layout/native isolation, player chrome alignment,
wordmark, desktop authentication and web-player regression checks passed.
The HTTP smoke script also passed against the existing Vercel deployment.
Live Cloudflare verification must run after publishing; a successful build alone
does not verify the Workers runtime. OpenNext reports Node.js middleware support
as experimental, so the smoke checks cover both anonymous and synthetic-cookie
proxy redirects without sending a real session to upstream services.

Wrangler minifies the upload. No automatic GitHub deployment pipeline is enabled;
future source changes need another Cloudflare build and deployment. GitHub Actions
remain disabled.

## Official references

- [Cloudflare OpenNext deployment guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)
- [OpenNext configuration and deployment](https://opennext.js.org/cloudflare/get-started)
- [OpenNext caching options](https://opennext.js.org/cloudflare/caching)
