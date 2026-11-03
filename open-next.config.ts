import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// The application uses dynamic authenticated routes. Start without persistent
// incremental storage; no R2/KV resource or per-user response cache is required.
const config = defineCloudflareConfig();

export default {
  ...config,
  buildCommand: "npm run build -- --webpack",
};
