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
