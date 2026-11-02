/** Use the current official endpoint for the legacy add-on; preserve custom/configured providers. */
export function subtitleAddonBaseUrl(transportUrl: string, addonId: string): string {
    const base = transportUrl.replace(/\/manifest\.json$/, "");
    try {
        const url = new URL(transportUrl);
        if (addonId === "org.stremio.opensubtitles" && url.protocol === "https:"
            && url.hostname === "opensubtitles.strem.io" && ["/", "/manifest.json", "/stremio/v1", "/stremio/v1/manifest.json"].includes(url.pathname)
            && !url.search && !url.username && !url.password) {
            return "https://opensubtitles-v3.strem.io";
        }
    } catch { /* Preserve the existing provider error path for invalid URLs. */ }
    return base;
}
