# Navigator

Navigator is a Next.js web app.

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

## Cast artwork

To show cast headshots and character names on movie and TV pages, add a
[TMDB API Read Access Token](https://www.themoviedb.org/settings/api) to your
local `.env` file:

```dotenv
TMDB_API_READ_ACCESS_TOKEN=your_read_access_token
```

The token is used only on the server. Credits are cached for a day. When the
key is missing or the lookup fails, the cast section uses the names supplied
by the installed Stremio add-on and avatar initials. Missing individual photos
also fall back to initials.

Run `node scripts/test-cast.cjs` to check credit mapping, movie/TV lookups, and
fallback behavior without a live TMDB request.
