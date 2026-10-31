# Navigator

Navigator is a Next.js web app.

The optional [desktop shell](desktop/README.md) adds native mpv playback beneath
the same React controls on macOS, Windows, and Linux. Start it against your
existing development server with `npm run desktop:dev`.

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Navigation performance checks

```bash
npm run build && npm run test:navigation
```

The check starts an isolated production server with synthetic Stremio data.
Recommendations and playback progress each take 1.2 seconds; movie, series,
and episode titles must render within 700 ms while those sections stream.
It also checks episode progress isolation and the login redirect. No account
or installed addons are needed. Browser prefetching should be checked with a
production build, since Next.js disables automatic prefetching in development.

## TMDB artwork

Posters, backdrops, original-color logos, episode stills, and cast headshots
come from TMDB. Open **Settings → Artwork** and save your
[TMDB API Read Access Token](https://www.themoviedb.org/settings/api).
Navigator validates it before saving. You can replace or remove it there;
an invalid replacement keeps the existing token. The desktop app needs no
environment variables for artwork.

The token is stored in a persistent HttpOnly cookie for this device/browser
profile and is never returned by Settings or included in artwork URLs. Hosted
web deployments can optionally provide a shared server token in `.env`:

```dotenv
TMDB_API_READ_ACCESS_TOKEN=your_read_access_token
```

Personal Settings tokens take precedence over the hosted server token. Desktop
uses only the token saved in Settings. Image metadata and credits are cached
for a day. Artwork loads on demand through `/api/artwork`, which redirects to
TMDB's image CDN. English posters/logos and text-free backdrops are preferred;
logos retain the colors supplied by TMDB.

IMDb IDs are resolved to TMDB IDs; explicit `tmdb:` IDs are also supported.
Unrecognized addon IDs, missing credentials, and unavailable artwork use neutral
placeholders, without falling back to another artwork provider. Cast names still
come from the installed Stremio addon when TMDB credits are unavailable, with
initials for missing headshots.

Run `npm run test:desktop` to check credential validation/storage, image
selection, routing, credit mapping, and fallbacks without live TMDB requests.
