import "server-only";
import { getAuthData } from "@/lib/server/auth";
import { getInstalledAddons } from "@/app/actions/auth";
import { fetchLibraryItems } from "@/app/actions/media";
import { selectLibraryPage, type LibraryQuery } from "@/lib/library-page";
import type { MediaItem } from "@/types/stremio";

const snapshots = new Map<string, { expires: number; items: MediaItem[] }>();
const pending = new Map<string, Promise<MediaItem[]>>();
const SNAPSHOT_TTL_MS = 30_000;
const SNAPSHOT_LIMIT = 8;
export class LibraryNotFound extends Error {}

/** Account/manifest-scoped short-lived metadata snapshots let paging and search
 * reuse one catalog read. Watched state/progress are fetched independently. */
export async function loadLibraryPage(addonUrl: string, query: LibraryQuery) {
    const { authKey } = await getAuthData();
    const addons = await getInstalledAddons();
    const addon = addons.find(candidate => candidate.transportUrl === addonUrl);
    if (!addon) throw new LibraryNotFound("Library not found");
    const key = JSON.stringify([authKey, addonUrl, addon.manifest.catalogs]);
    const snapshot = snapshots.get(key);
    let items: MediaItem[];
    if (snapshot && snapshot.expires > Date.now()) {
        snapshots.delete(key); snapshots.set(key, snapshot);
        items = snapshot.items;
    } else {
        let request = pending.get(key);
        if (!request) {
            request = fetchLibraryItems(addonUrl, Number.MAX_SAFE_INTEGER).then(data => {
                // Only card metadata belongs in this cache or its paged response.
                const cards = data.items.map(({ id, type, name, year, releaseInfo, imdbRating }) => ({ id, type, name, year, releaseInfo, imdbRating }));
                if (!data.incomplete) {
                    snapshots.set(key, { expires: Date.now() + SNAPSHOT_TTL_MS, items: cards });
                    if (snapshots.size > SNAPSHOT_LIMIT) snapshots.delete(snapshots.keys().next().value!);
                }
                return cards;
            }).finally(() => pending.delete(key));
            pending.set(key, request);
        }
        items = await request;
    }
    return selectLibraryPage(items, query);
}
