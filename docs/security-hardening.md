# Security hardening and deployment

This change addresses the pre-publication repository review. It changes session
cookies, outbound requests, dependency resolution and third-party notices.
Existing plaintext JSON cookies are rejected: sign in again after updating.
No account credentials are migrated from an unverified cookie.

## Session configuration

Hosted production servers, including Cloudflare, require a stable
`NAVIGATOR_SESSION_SECRET`: exactly 64 hexadecimal characters representing 32
random bytes. Generate one on the deployment machine with
`openssl rand -hex 32`, save it in the hosting provider's secret store, and share
it across replicas of that deployment. Never commit it, put it in a `NEXT_PUBLIC_`
variable, or include it in a distributable archive. Rotating it invalidates all
Navigator sessions. The application fails closed if it is absent or malformed.

Development and the explicitly loopback-bound native desktop server generate a
32-byte key once, outside the source and application bundle. It persists in
`Navigator Development/session.key` or `Navigator Desktop/session.key` under
macOS Application Support, Windows LOCALAPPDATA, or Linux XDG_CONFIG_HOME
(default `~/.config`). POSIX creation modes are 0700 for a new directory and 0600
for the key. Windows uses the profile directory's ACLs. Deleting the key signs
that local app out. Never copy this profile directory into a release.

Successful official Stremio email/password login or approved device linking is
required to issue a session. `jose`
EncryptJWT creates an authenticated AES-256-GCM JWE with issuer, audience,
subject, issued-at and 30-day expiration claims. Only a minimal profile and the
Stremio credential are encrypted inside it. The cookie is HttpOnly,
SameSite=Lax, Path=/ and Secure in hosted production. The existing native
127.0.0.1 HTTP exception remains narrowly scoped to its server-side runtime flags.

`lib/server/auth.ts` verifies the encrypted session close to protected data and
network access. It is server-only, not a public Server Action. Proxy uses the
same verifier for routing; layouts and protected handlers also check it.
`getUser` and `/api/auth/session` expose only public profile fields, with no-store
responses. Browser code cannot read or write the session credential. Logout
clears the cookie and attempts to revoke the Stremio credential. As with other
stateless sessions, clearing one browser's cookie does not revoke a copied
Navigator cookie; expiration or deployment-key rotation does. Do not treat
Navigator's session verifier as upstream account authorization: Stremio still
checks its bearer key for account data and mutations.

The provider button uses Stremio's official `link.stremio.com` pairing service,
not a third-party OAuth endpoint. Pairing codes and attempt IDs are bound to a
five-minute encrypted HttpOnly cookie with a separate JWT audience. Polling
requires the matching attempt; an approved Stremio key is verified using
`getUser` and immediately exchanged for the normal encrypted session. Neither
the polling response nor browser JavaScript receives that Stremio key. Completed
pairing cookies are deleted, and logout clears any pending pairing cookie.

Guest browsing intentionally allows `/`, `/search`, explicit TMDB movie/series
routes, and the fixed TMDB search/artwork/episode read endpoints. These reads use
the server's TMDB credential (or the device's saved token), without exposing it
to JavaScript. Account pages, Stremio data, add-on requests, playback, mutations,
and AI requests still require a verified session. The app shell resets its Jotai
store when the account changes and disables personal watch-history reads for
guests. `scripts/test-guest-discovery.cjs` and `scripts/test-sign-in-dialog.cjs`
cover this public discovery and sign-in boundary. Hosted guests prefer the
server's TMDB key over a previous account's saved token; signed-in users retain
personal-key precedence. `scripts/test-stremio-link.cjs` covers pairing expiry,
binding, pending/approved responses, tampering, replay, and credential privacy.

## Outbound request policy

`lib/server/outbound-fetch.ts` protects variable addon, subtitle and AI provider
requests, including AI SDK attachment downloads. It validates HTTP(S) URLs,
rejects embedded credentials, checks IPv4/IPv6 addresses including mapped and
noncanonical spellings, and rejects private, loopback, link-local, shared,
multicast and reserved address ranges. DNS results are validated inside Undici's
connection lookup, rejecting the entire answer if any returned address is
unsafe. The validated lookup result is the connection target, avoiding a
check-then-resolve DNS rebinding race. TLS continues to validate the hostname.
Variable upstream fetches opt out of Next's implicit response cache so its independent body clone cannot keep draining after a size rejection. Existing explicit application metadata caches remain in place.

Addon/subtitle GET redirects are followed manually, with a new destination
check at every hop, at most four hops, no HTTPS downgrade, and no Authorization,
Cookie or Proxy-Authorization forwarded to another origin. Provider redirects
are refused entirely. Default responses are bounded to 8 MiB after decompression
and 15 seconds; subtitle files use 2 MiB. Model discovery uses 1 MiB/10 seconds;
AI streams retain a 120-second transport deadline and the 8 MiB response bound.
Client abort signals propagate through the transfer. The provider preconnect
hook is intentionally a no-op so it cannot bypass destination checks.

A custom OpenAI-compatible endpoint must use its own user-supplied key. Shared
`OPENAI_API_KEY` is used only with the exact built-in official base URL; it is
never sent to a custom endpoint. Model discovery and chat both authenticate
before using shared credentials. Other shared provider fallbacks use fixed
provider endpoints and the protected transport.

Localhost model providers remain available in development and the native
loopback-bound desktop runtime. This exception is selected only from server
configuration, never a request header, cookie or JSON field. It does not allow
LAN, cloud-metadata, or private addon/subtitle destinations. Hosted instances
cannot use localhost provider URLs.

### Cloudflare Workers

No per-domain outbound allowlist is required. Addon providers and subtitle CDNs
can use arbitrary public HTTP(S) origins without server-side registration.

On Node, our Undici connection lookup validates the actual resolved addresses.
On hosted Cloudflare Workers, the runtime supplies the equivalent network
boundary: workerd's default internet service permits public addresses only,
including filtering DNS lookup results at the network layer. We use its global
fetch instead of trying to attach an unsupported Node dispatcher or performing
a DNS-over-HTTPS preflight that could race with the connection lookup.
Application URL checks, private literal/localhost rejection, response limits,
and redirect validation still apply on both platforms.

The existing `global_fetch_strictly_public` flag makes same-zone traffic pass
through Cloudflare's public front door. It is retained, but is distinct from the
runtime's private-address filtering. No VPC/private-network service binding is
used for guarded fetches in this Worker. Requests use manual redirects because
Workers does not support fetch's `redirect: "error"`.

This runtime guarantee applies to hosted Cloudflare's public egress, not every
custom workerd configuration. Miniflare intentionally permits private networks
by default for local development; do not treat that local network configuration
as production-equivalent. Navigator's ordinary local development runs on Next.js/
Node and uses the Undici connection guard. A custom workerd host must retain
public-only egress for these untrusted requests.

This policy was checked against AIOStreams at commit
`46f85936debf338c03ad8f251c54b7e4e9466a0d` and Cloudflare's runtime implementation.
AIOStreams likewise permits arbitrary addon
hosts and, when private-address protection is enabled, validates addresses in
its Node connection lookup and checks capped-response redirect hops. Its
`ALLOW_PRIVATE_URLS` defaults to true for self-hosted setups and explicitly warns
operators to turn it off on public instances. Navigator keeps private targets
blocked, with only its existing desktop/development loopback-provider exception.
No AIOStreams implementation code was copied into the web application.

## Dependencies and licensing

The new direct dependencies are `jose` (standard authenticated session encryption),
`ipaddr.js` (maintained IPv4/IPv6 parsing/range classification) and `undici` 7
(Node 22.13-compatible connection-level DNS enforcement). Existing packages were
updated within their declared major-version ranges. Unused direct axios and
Ant Design declarations were removed; transitive consumers retain their own
dependencies. A narrowly scoped `@node-minify/core` glob override replaces its
vulnerable exact 10.3.3 pin with the compatible patched 10.5 series. Both Bun and
npm lockfiles are checked so that either install path receives the security fixes.

[THIRD-PARTY.md](../THIRD-PARTY.md) identifies the GPL web / AGPL desktop boundaries,
MIT Arc/skill notices, fonts, flags and mobile dependencies. Native packaging
copies the project license, copied-code notices and a generated inventory of
installed npm package license/notice texts. This inventory includes development
packages too, so it can overinclude notices without dropping runtime notices.
Binary releases still need their exact corresponding source; existing published
archives are immutable and are not retroactively changed by this patch.

## Verification and research sources

Run `npm run test:security`, the affected playback/search/settings/Navigator
regressions, `tsc --noEmit --incremental false`, and both lockfile audits. Security
tests use real JOSE encryption and mocked network transports: they make no paid
provider calls or internal-service probes. Native builds, production bundling,
Cloudflare deployment and physical-device playback require separate verification.

Validation completed on November 4, 2026: all three security scripts and 22
affected regression scripts passed, along with TypeScript, focused lint (zero
errors/warnings), npm's clean-install dry run, and diff whitespace checks. The
notice collector produced notices for 1,560 installed package versions. Bun
reported four moderate/one low advisory; npm reported 21 moderate/seven low
vulnerable package entries. Both reported zero high or critical findings. The
source secret scan's only finding was the previously documented Android
certificate fingerprint; exact checks against local credential values found no
matches. These are source and mocked-transport checks, not deployed/native runtime
verification.

The design was checked against primary documentation:

- [Next.js authentication: data access checks, session cookies and DTOs](https://nextjs.org/docs/app/guides/authentication)
- [JOSE JWT authenticated decryption and claim validation](https://github.com/panva/jose/blob/main/docs/jwt/decrypt/functions/jwtDecrypt.md)
- [Official Stremio request types and login endpoints](https://github.com/Stremio/stremio-core/blob/master/src/types/api/request.rs)
- [OWASP SSRF prevention, address validation and redirects](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Undici connection lookup](https://github.com/nodejs/undici/blob/main/docs/docs/api/Client.md)
- [ipaddr.js address classification](https://github.com/whitequark/ipaddr.js)
- [AI SDK custom fetch transport](https://ai-sdk.dev/providers/openai-compatible-providers)
- [AIOStreams private-address connection guard at the reviewed commit](https://github.com/Viren070/AIOStreams/blob/46f85936debf338c03ad8f251c54b7e4e9466a0d/packages/core/src/utils/private-addresses.ts)
- [AIOStreams private-URL configuration and public-instance warning](https://github.com/Viren070/AIOStreams/blob/46f85936debf338c03ad8f251c54b7e4e9466a0d/packages/core/src/config/schema/http.ts)
- [workerd public-only internet service and DNS filtering](https://github.com/cloudflare/workerd/blob/main/src/workerd/server/workerd.capnp)
- [Miniflare local internet network configuration](https://github.com/cloudflare/workers-sdk/blob/main/packages/miniflare/src/plugins/core/index.ts)
- [Cloudflare Node HTTP limitations](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/)
- [Cloudflare request/redirect behavior](https://developers.cloudflare.com/workers/runtime-apis/request/)
- [Cloudflare global-fetch flag semantics](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public)
- [form-data multipart boundary advisory](https://github.com/form-data/form-data/security/advisories/GHSA-fjxv-7rqg-78g4)
- [glob CLI advisory and patched versions](https://github.com/isaacs/node-glob/security/advisories/GHSA-5j98-mcp5-4vw2)
- [Arc MIT license and copyright notice](https://uiarc.dev/license)
- [Vendored skill provenance and notices](../.agents/skills/LICENSE-NOTICES.md)
