import type { StremioAddon } from "@/types/stremio";

export const ADDON_CAPABILITIES = [
    { value: "catalog", label: "Catalogs" },
    { value: "stream", label: "Streams" },
    { value: "subtitles", label: "Subtitles" },
    { value: "meta", label: "Metadata" },
] as const;

export interface AddonListItem {
    id: string;
    name: string;
    version: string;
    description: string;
    logo?: string;
    capabilities: string[];
    types: string[];
    catalogCount: number;
    configurable: boolean;
    protected: boolean;
}

export function addonTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        movie: "Movies", movies: "Movies", series: "TV Shows", tv: "TV",
        "anime.movie": "Anime Movies", "anime.series": "Anime TV Shows",
        trakt: "Trakt", imdb: "IMDb", tmdb: "TMDB",
    };
    const normalized = type.trim().toLowerCase();
    return labels[normalized] ?? normalized.split(/[\s._-]+/u).filter(Boolean)
        .map((word) => labels[word] ?? word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function toAddonListItem(addon: StremioAddon, index: number): AddonListItem {
    const manifest = addon.manifest;
    const capabilities = [...new Set((manifest.resources ?? []).map((resource) => {
        const name = (typeof resource === "string" ? resource : resource.name).toLowerCase();
        return name === "streams" ? "stream" : name;
    }))];
    if (manifest.catalogs?.length && !capabilities.includes("catalog")) capabilities.push("catalog");
    return {
        id: `${manifest.id}:${index}`,
        name: manifest.name?.trim() || "Unnamed addon",
        version: manifest.version,
        description: manifest.description?.trim() || "",
        logo: manifest.logo,
        capabilities,
        types: [...new Set(manifest.types ?? [])],
        catalogCount: manifest.catalogs?.length ?? 0,
        configurable: !!(manifest.behaviorHints?.configurable || manifest.behaviorHints?.configurationRequired),
        protected: !!addon.flags?.protected,
    };
}

export function filterAddons(addons: AddonListItem[], query: string, capability = "all") {
    const search = query.trim().toLocaleLowerCase();
    return addons.filter((addon) => {
        if (capability !== "all" && !addon.capabilities.includes(capability)) return false;
        const text = [addon.name, addon.description, ...addon.types, ...addon.types.map(addonTypeLabel), ...addon.capabilities,
            ...ADDON_CAPABILITIES.filter((item) => addon.capabilities.includes(item.value)).map((item) => item.label),
        ].join(" ").toLocaleLowerCase();
        return !search || text.includes(search);
    });
}
