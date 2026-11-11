export const SETTINGS_CATEGORIES = [
    { id: "playback", label: "Playback" },
    { id: "subtitles", label: "Subtitles" },
    { id: "navigator", label: "Navigator" },
    { id: "connections", label: "Connections" },
    { id: "about", label: "About" },
] as const;

export type SettingsCategory = typeof SETTINGS_CATEGORIES[number]["id"];

export function isSettingsCategory(value: string): value is SettingsCategory {
    return SETTINGS_CATEGORIES.some(category => category.id === value);
}

export function settingsCategoryFromPath(pathname: string): SettingsCategory {
    const category = pathname.split("/")[2];
    return isSettingsCategory(category) ? category : "playback";
}
