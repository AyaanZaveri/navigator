import "server-only";
import { createHash } from "node:crypto";
import type { StremioAddon } from "@/types/stremio";

const API = "https://api.strem.io/api";
const pending = new Map<string, Promise<unknown>>();

export function addonKey(transportUrl: string) {
    return createHash("sha256").update(transportUrl).digest("hex");
}

export function addonLinks(addon: StremioAddon) {
    const url = new URL(addon.transportUrl.replace(/^stremio:\/\//iu, "https://"));
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
        throw new Error("This addon does not support web links.");
    }
    const shareUrl = url.toString();
    let configureUrl: string | null = null;
    if ((addon.manifest.behaviorHints?.configurable || addon.manifest.behaviorHints?.configurationRequired)
        && /\/manifest\.json$/u.test(url.pathname)) {
        url.pathname = url.pathname.replace(/manifest\.json$/u, "configure");
        url.hash = "";
        configureUrl = url.toString();
    }
    return { shareUrl, configureUrl };
}

async function request(authKey: string, method: string, body: Record<string, unknown>) {
    const response = await fetch(`${API}/${method.charAt(0).toLowerCase() + method.slice(1)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: method, authKey, ...body }),
        cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("Stremio is unavailable. Please try again.");
    const data = await response.json();
    if (data.error || !data.result) throw new Error("Stremio could not update your addons. Please try again.");
    return data.result;
}

export async function readAddonCollection(authKey: string): Promise<StremioAddon[]> {
    const result = await request(authKey, "AddonCollectionGet", { update: true });
    if (!Array.isArray(result.addons) || !result.addons.every((addon: StremioAddon) =>
        addon && typeof addon.transportUrl === "string" && addon.manifest && typeof addon.manifest.id === "string")) {
        throw new Error("Could not read your addon collection. Please refresh and try again.");
    }
    return result.addons;
}

export function findInstalledAddon(addons: StremioAddon[], key: string) {
    const addon = addons.find((item) => addonKey(item.transportUrl) === key);
    if (!addon) throw new Error("This addon is no longer installed. Refresh the page and try again.");
    return addon;
}

export async function removeInstalledAddon(authKey: string, key: string) {
    // CollectionSet replaces the full list. Serialize this app's writes and read fresh each time.
    const previous = pending.get(authKey) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
        const addons = await readAddonCollection(authKey);
        const addon = findInstalledAddon(addons, key);
        if (addon.flags?.protected) throw new Error("This is a protected Stremio addon and cannot be uninstalled.");
        const remaining = addons.filter((item) => item.transportUrl !== addon.transportUrl);
        const result = await request(authKey, "AddonCollectionSet", { addons: remaining });
        if (result.success !== true) throw new Error("Stremio did not confirm the uninstall. Please try again.");
    });
    pending.set(authKey, operation);
    try { await operation; }
    finally { if (pending.get(authKey) === operation) pending.delete(authKey); }
}

export async function addInstalledAddon(authKey: string, addon: StremioAddon) {
    const previous = pending.get(authKey) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
        const addons = await readAddonCollection(authKey);
        if (addons.some(item => item.transportUrl === addon.transportUrl)) {
            throw new Error("This addon configuration is already installed.");
        }
        const result = await request(authKey, "AddonCollectionSet", { addons: [...addons, addon] });
        if (result.success !== true) throw new Error("Stremio did not confirm the install. Please try again.");
    });
    pending.set(authKey, operation);
    try { await operation; }
    finally { if (pending.get(authKey) === operation) pending.delete(authKey); }
}
