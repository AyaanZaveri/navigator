## Browser Automation

Never use Blade Bro (`bladebro`, its MCP server, or the `bladebro-cli` skill)
without the user's explicit permission for the current task.
Do not run browser automation unless the user asks for it or gives permission.

## Development

The user runs the development server. Do not start another server or run builds
unless the user explicitly asks. Make changes against the existing dev server.

## Web Research and Vercel

Use `donsetch-cli` with `donsetch search` to discover sources and
`donsetch fetch <url>` to read them. Never fetch a search engine results page
as a substitute for search. For Vercel operations, use the `vercel-cli` skill
and `vercel` CLI; verify project and scope before modifying resources.

If a site blocks automation with a bot challenge, try a first-party public
endpoint or a less protected public page before declaring the task blocked.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
