import "server-only";
import { cache } from "react";
import { getAuthData } from "./auth";
import { getInstalledAddons } from "@/app/actions/auth";
import { getTMDBToken } from "@/lib/tmdb-credentials";
import { opaqueMetadataIdentity } from "./metadata-cache";

export const metadataIdentity = cache(async () => {
    const session = await getAuthData().catch(() => null);
    const [addons, token] = await Promise.all([session ? getInstalledAddons() : Promise.resolve([]), getTMDBToken()]);
    const scope = session ? `${session.user._id}:${session.issuedAt}` : "anonymous";
    return { scope, revision: opaqueMetadataIdentity([scope, addons.map(addon => [addon.transportUrl, addon.manifest.id]), token, "en-US"]) };
});
