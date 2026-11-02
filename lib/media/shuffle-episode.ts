export interface ShuffleEpisode {
    id: string;
    season?: number;
    episode?: number;
    title?: string;
    name?: string;
    released?: string;
}

/** Pick uniformly across episodes, rather than giving small seasons more weight.
 * Legacy add-ons may omit release dates; exclude known future/invalid dates. */
export function pickRandomEpisode<T extends ShuffleEpisode>(
    episodes: T[],
    now = Date.now(),
    random: () => number = Math.random,
): T | null {
    const unique = new Map<string, T>();
    for (const episode of episodes) {
        if (!episode.id || !Number.isSafeInteger(episode.season) || episode.season! < 1
            || !Number.isSafeInteger(episode.episode) || episode.episode! < 1) continue;
        if (episode.released) {
            const released = Date.parse(episode.released);
            if (!Number.isFinite(released) || released > now) continue;
        }
        unique.set(episode.id, episode);
    }
    const available = [...unique.values()];
    return available.length ? available[Math.floor(random() * available.length)] : null;
}
