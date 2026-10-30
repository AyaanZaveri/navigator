# AGENTS.md — Navigator

## Project Overview

Navigator is a modern streaming media client built on the **Stremio addon protocol**. It is a **Next.js 16** web application (with optional Electron desktop wrapper) that aggregates content from user-installed Stremio addons — providing catalog browsing, search, video playback (HLS/DASH), subtitle rendering, and an AI-powered assistant.

**There is no proprietary backend.** All media content, streams, and subtitles are fetched directly from Stremio addons via their HTTP manifest/resource endpoints. User authentication goes through the official Stremio API (`api.strem.io`).

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.1.6 (App Router, Turbopack, React 19) |
| Language | TypeScript (strict mode, ESNext target) |
| Styling | Tailwind CSS v4, CSS variables for theming |
| UI Components | shadcn/ui (New York style), Radix UI primitives, Lucide icons |
| Animations | Framer Motion / Motion, tw-animate-css |
| State Management | Jotai (atoms) + React Context (settings, auth) |
| AI | Vercel AI SDK v5 (`ai` package) — Gemini, Ollama, Groq, OpenRouter providers |
| Video | `hls-video-element`, `dash-video-element`, `media-chrome`, `react-player` |
| Auth | Stremio API + httpOnly=false cookie (`stremio-auth`) |
| Package Manager | npm (lockfile: `package-lock.json`), bun also available (`bun.lock`) |
| Desktop | Electron (macOS hiddenInset title bar) |
| Analytics | Vercel Analytics + Speed Insights |

## Commands

```bash
# Development
npm run dev          # Start Next.js dev server (Turbopack)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint
```

## Browser Automation

- Check whether a dev server is running before using `bladebro`.
- Do not use `bladebro` while the dev server is running without the user's explicit permission. A general request to test or debug the app does not grant that permission.

## Project Structure

```
app/
├── layout.tsx              # Root layout (ThemeProvider, SettingsProvider, fonts)
├── globals.css             # Tailwind v4 config, CSS variables, theme tokens
├── (main)/                 # Main authenticated route group
│   ├── layout.tsx          # JotaiProvider, FullscreenDetector, KeyboardShortcuts, LayoutContent
│   ├── page.tsx            # Home — continue watching + addon catalog sections
│   ├── movie/[id]/         # Movie detail page
│   ├── series/[id]/        # Series overview page
│   ├── series/[id]/[season]/[episode]/  # Episode detail page
│   ├── search/             # Search results (query via ?q= param)
│   ├── settings/           # User settings (video, AI config, API keys)
│   ├── addons/             # Installed Stremio addons list
│   ├── library/[id]/       # Library view for a specific addon
│   └── person/[id]/        # Person stub page
├── actions/                # Server Actions ("use server")
│   ├── auth.ts             # Stremio login/logout, cookie management, addon fetching
│   ├── media.ts            # Catalog fetching, stream aggregation, metadata, resume items
│   ├── search.ts           # Multi-addon search with deduplication
│   ├── subtitles.ts        # Subtitle fetching from addon protocol
│   ├── tv-shows.ts         # Season/episode metadata derivation
│   ├── utils.ts            # Stream URL helpers, subtitle tracks, library mapping
│   └── index.ts            # Barrel re-exports
├── api/                    # API Route Handlers
│   ├── auth/login/         # POST — authenticateUser wrapper
│   ├── auth/logout/        # POST — logout wrapper
│   ├── chat/               # POST — AI chat streaming (multi-provider, tool-calling)
│   ├── streams/addon/      # GET — streams from specific addon
│   └── streams/addons/     # GET — list stream-capable addons
├── tools/                  # AI tool definitions (Vercel AI SDK tools)
│   ├── media.ts            # searchMedia, playMedia, navigateToMedia, continueWatching, etc.
│   ├── people.ts           # getPeople, getPersonDetails, getPersonFilmography
│   ├── tv-shows.ts         # getSeasons, getEpisodes
│   ├── subtitles.ts        # skipToSubtitleContent, createExplainScene, createAnalyzeMedia
│   ├── theme.ts            # themeToggle
│   ├── system-prompt.ts    # Dynamic system prompt with media context
│   └── index.ts            # createAllTools factory
└── components/             # App-specific components (auth-error-handler)

components/                 # Shared components
├── ui/                     # shadcn/ui primitives (button, dialog, input, etc.)
├── navigator/              # AI assistant UI (ai-ask, media cards, theme toggle)
├── ai-elements/            # AI-related elements (code-block, tool)
├── Aurora/                 # Aurora background effect
├── LightRays/              # Light ray effects
├── icons/                  # Custom icon components
├── magicui/                # Magic UI components
├── media-page/             # Media page layout components
├── motion-primitives/      # Motion/animation primitives
├── dashboard/              # Dashboard components
├── logs/                   # Log viewer components
├── global-media-player.tsx # Full video player (HLS/DASH, subtitles, progress)
├── media-card.tsx          # Poster card (regular + continue watching modes)
├── media-section.tsx       # Horizontal scrollable media row
├── app-sidebar.tsx         # Sidebar navigation
├── search-component.tsx    # Search bar with typeahead suggestions
├── season-episodes.tsx     # TV season/episode browser
├── layout-content.tsx      # Main layout orchestrator
└── ...                     # Other feature components

contexts/                   # React Contexts
├── AuthContext.tsx          # Auth state wrapper
├── MediaPlayerContext.tsx   # Media player state (thin Jotai wrapper)
└── settings-context.tsx    # Settings with localStorage persistence

hooks/                      # Custom React hooks
├── useAuth.ts              # Client-side auth from cookie
├── useAI.ts                # AI chat integration
├── useKeyboardShortcut.ts  # Declarative keyboard shortcuts
└── use-mobile.ts           # Mobile breakpoint detection

lib/                        # Utilities
├── atoms.ts                # Jotai atoms (player, AI, aurora, fullscreen)
├── auth-client.ts          # Client-side auth API wrapper class
├── utils.ts                # cn() (clsx + tailwind-merge)
├── device-detection.ts     # Device/platform detection
├── series-route.ts         # Series URL construction helpers
└── compose-refs.ts         # Ref composition utility

types/
├── stremio.d.ts            # All Stremio protocol types (auth, addons, meta, streams)
└── electron.d.ts           # Electron IPC types

proxy.ts                    # Next.js middleware — route protection
electron/                   # Electron main/preload scripts
```

## Architecture Patterns

### Server Components by Default

Pages are async server components. Client components are explicitly marked with `"use client"`. Server Actions use `"use server"` directive. This is critical — do not add `"use client"` to server components or remove it from client components without understanding the implications.

### Addon-First Architecture

All content flows through the Stremio addon protocol. The pattern is:
1. Get installed addons via `getInstalledAddons()` (Stremio API)
2. Query addon manifests for supported resources/catalogs
3. Fetch resources from addon HTTP endpoints: `{transportUrl}/{resource}/{type}/{id}.json`
4. Transform Stremio types (`StremioMetaPreview`, `StremioMeta`) into app types (`MediaItem`)

Helper functions in `app/actions/media.ts`: `addonSupportsResource()`, `addonSupportsCatalog()`, `fetchAddonResource<T>()`.

### State Management (Hybrid)

- **Jotai atoms** (`lib/atoms.ts`): Cross-component reactive state — media player visibility, current media, AI panel, aurora colors, fullscreen state. Wrapped in `JotaiProvider` at the `(main)` layout level.
- **React Context**: Settings persistence (`settings-context.tsx` with localStorage), auth state (`AuthContext.tsx`).
- **Derived atoms**: `playMediaAtom`, `skipToTimestampAtom`, `updateAuroraColorsAtom` — write-only atoms that compose multiple state updates.

### Auth Flow

1. Login via `OnboardingFlow` → `authenticateUser(email, password)` server action
2. POST to `https://api.strem.io/api/login` with Stremio web headers
3. Set `stremio-auth` cookie (JSON with `authKey`, `user`, `timestamp`, 30-day expiry)
4. `proxy.ts` middleware enforces auth — redirects unauthenticated users to `/login`
5. Client reads cookie via `useAuth()` hook (polls every 5s)

### Caching Strategy

- Catalog/metadata fetches: `next: { revalidate: 300 }` (5-minute ISR)
- Streams/subtitles: `cache: "no-store"` (always fresh)
- Client-side: `Map` caches for seasons/episodes in `SeasonEpisodes` component
- Search: `React.cache()` on `getInstalledAddons` for request deduplication

### Error Handling

Standard pattern: `try/catch` with `console.error`, return empty arrays or `null` on failure. Never throw from server actions — callers always get a safe fallback value.

### Request Headers

All Stremio API/addon requests use spoofed headers to match the official Stremio web client:
```typescript
headers: {
  "Content-Type": "application/json",
  Referer: "https://web.stremio.com/",
  Origin: "https://web.stremio.com",
  "User-Agent": "Mozilla/5.0 ... stremio-web/1.0.0",
}
```

## Code Style & Conventions

- **TypeScript strict mode** — always use proper types, avoid `any`
- **Path aliases**: `@/*` maps to project root (e.g., `@/components/ui/button`)
- **Component files**: PascalCase exports, kebab-case filenames (e.g., `media-card.tsx` exports `MediaCard`)
- **shadcn/ui**: New York style variant, Radix primitives, `cn()` utility from `@/lib/utils` for class merging
- **Tailwind**: Use Tailwind utility classes, CSS variables for theme tokens, `dark:` variant via class strategy
- **Fonts**: Inter (body `--font-inter`), Geist Mono (code `--font-geist-mono`), Poppins (headings `--font-poppins`)
- **ESLint rules**: `prefer-const`, `no-var`, 4-space indent, semicolons required, unused vars with `_` prefix allowed
- **Imports**: Use `@/` path aliases, not relative paths for cross-directory imports
- **Server Actions**: Always in `app/actions/` with `"use server"` at the top of the file
- **API routes**: Use Next.js Route Handlers (`route.ts`) in `app/api/`

## Environment Variables

```bash
# Required for AI features (can also be configured per-user in Settings UI)
GOOGLE_GENERATIVE_AI_API_KEY=   # Gemini API key
```

Other AI provider keys (Groq, OpenRouter) are stored client-side in localStorage via the Settings page and sent per-request to the `/api/chat` endpoint.

## Testing

No test framework is currently configured. The `eslint-plugin-jest` is installed but there are no test files. When adding tests:
- Use Jest as the test runner (already configured in ESLint)
- Place test files adjacent to source files or in a `__tests__` directory
- Follow the `_` prefix convention for unused variables in tests

## Git Workflow

- **Default branch**: `main`
- **Ignored files**: `.env*`, `node_modules/`, `.next/`, `build/`, `dist/`, `.DS_Store`
- Commit messages should be clear and descriptive

## Boundaries — What NOT to Do

- **Never commit `.env` files** or hardcode API keys in source code
- **Never modify `components/ui/`** files directly — these are shadcn/ui generated components. Use `npx shadcn@latest add <component>` to add new ones
- **Never remove `"use client"` or `"use server"` directives** without understanding the server/client component boundary
- **Never add a proprietary backend** — all media content must flow through the Stremio addon protocol
- **Never break the addon-first architecture** — do not hardcode media sources or bypass addon manifests
- **Never store secrets in localStorage** — only non-sensitive user preferences belong there
- **Never modify `proxy.ts` auth logic** without testing both authenticated and unauthenticated flows
- **Never use `var`** — use `const` or `let` (`prefer-const` is enforced)
- **Do not add dependencies without justification** — the project already has a large dependency tree
- **Do not create files in `build/` or `dist/`** — these are build output directories

## Key Files Reference

| File | Purpose |
|---|---|
| `proxy.ts` | Next.js middleware for auth-based route protection |
| `lib/atoms.ts` | All Jotai atoms (global reactive state) |
| `app/actions/media.ts` | Core media fetching logic (~500 lines) |
| `app/actions/auth.ts` | Stremio auth + cookie management |
| `app/tools/system-prompt.ts` | AI assistant system prompt with context |
| `app/tools/index.ts` | AI tool factory (`createAllTools`) |
| `components/global-media-player.tsx` | Video player with HLS/DASH/subtitles |
| `components/layout-content.tsx` | Main layout orchestrator |
| `contexts/settings-context.tsx` | Settings persistence (localStorage) |
| `types/stremio.d.ts` | All Stremio protocol type definitions |
| `next.config.ts` | Standalone output, turbopack, image config |
| `components.json` | shadcn/ui configuration |

## Deployment

**Electron** (macOS desktop):
- Wraps the Next.js dev server in an Electron BrowserWindow
- macOS-specific: `hiddenInset` title bar, fullscreen IPC events
- Build via `electron-builder` targeting DMG (x64 + arm64)
