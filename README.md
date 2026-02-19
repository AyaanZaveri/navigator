# Navigator

## Electron Setup

This project ships as a Next.js app wrapped by Electron.

### Development

```bash
npm run electron
```

- Starts Next dev server on `http://localhost:3000`
- Launches Electron and loads the dev URL

### Production Packaging (All Configured Targets)

```bash
npm run electron-pack
```

This command now does the full pipeline:
1. `next build` (standalone output)
2. Copies required standalone assets for runtime (`public` + `.next/static`)
3. Generates `build/icon.icns` from `public/logo/desktop/navigator.png`
4. Prepares optional Sharp package stubs required by `electron-builder` on Apple Silicon
5. Runs `electron-builder`

### Compile for macOS ARM (Apple Silicon)

```bash
npm run electron-build-mac-arm64
```

Artifacts are written to:

```text
dist/
```

Expected output includes an ARM64 `.dmg` for macOS.

## Notes

- Electron production mode uses the bundled Next standalone server (not localhost).
- macOS app icon is sourced from this project branding and generated as `build/icon.icns`.
- If you change branding, update `public/logo/desktop/navigator.png` and rerun the build command.
