# Vercel Analytics

Navigator already includes Vercel Web Analytics and Speed Insights in the root
[layout](../app/layout.tsx). No analytics API key or extra environment variable
is needed.

For the existing hosted project, open [Navigator's Analytics dashboard](https://vercel.com/ayaanzaveri08s-projects/navigator/analytics)
to see visitors and page views, or [Speed Insights](https://vercel.com/ayaanzaveri08s-projects/navigator/speed-insights)
for page performance. Both are enabled and have received data. Reports need real
visits; ad blockers can prevent collection.

## Your own deployment

1. Enable Web Analytics in your Vercel project's Analytics tab.
2. Deploy the app after enabling it. Connecting the GitHub repository lets pushes
   to your production branch deploy automatically.
3. Visit the site and check the Analytics dashboard.

The app uses the Next.js integrations from `@vercel/analytics/next` and
`@vercel/speed-insights/next`. They render only when Vercel sets `VERCEL=1` and
`ELECTRON` is not `true`, so ordinary local, native desktop, and Cloudflare
deployments don't load Vercel telemetry. The auth proxy leaves `/_vercel/*`
collection routes accessible. No custom events are configured.

See Vercel's [Web Analytics quickstart](https://vercel.com/docs/analytics/quickstart)
and [Speed Insights quickstart](https://vercel.com/docs/speed-insights/quickstart)
for setup, collection, and plan details.
