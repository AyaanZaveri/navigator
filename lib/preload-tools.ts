/** Intent preloading uses the same module chunks as next/dynamic. Failed warmups
 * are harmless: the normal render can retry the import when it is requested. */
export function preloadPlayer() {
    void import("@/components/global-media-player").catch(() => {});
}
export function preloadNavigator() {
    void import("@/components/navigator/ai-ask").catch(() => {});
}
