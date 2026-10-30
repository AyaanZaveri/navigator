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
