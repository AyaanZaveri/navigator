import { tool, type LanguageModel } from "ai";
import { z } from "zod";
import { resolveEpisode, type EpisodeQuery, type EpisodeProgress } from "@/lib/episode-discovery";
import { getTinyfishConfig } from "@/lib/tinyfish-credentials";
import { researchMediaWeb, searchTinyfish, fetchMediaWebSources } from "@/lib/tinyfish";
import { navigateToEpisode, navigateToMedia, playMedia, playMediaInputSchema } from "./media";
import { getTMDBEpisode } from "@/lib/tmdb-discovery";
import { record } from "@/lib/navigator-chat";

const queryFields = {
    seriesId: z.string().optional().describe("Known TMDB/IMDb series ID; use instead of searching the title again"),
    seriesQuery: z.string().min(1).max(300).optional().describe("TV show title, when its ID is unknown"),
    episodeQuery: z.string().min(1).max(1500).describe("The user's episode title or plot/event/guest description, preserving distinctive details"),
    seasonNumber: z.number().int().min(0).optional().describe("Only when the user specifies the season"),
};

export function createEpisodeTools(model?: LanguageModel) {
    const resolve = async (input: EpisodeQuery, options: { abortSignal?: AbortSignal; context?: unknown }) => {
        const config = await getTinyfishConfig();
        const onProgress = record(options.context).onEpisodeProgress as ((_progress: EpisodeProgress) => void) | undefined;
        return resolveEpisode(input, { model, signal: options.abortSignal, onProgress,
            research: config.enabled && config.apiKey ? (query, purpose, signal) => researchMediaWeb(query, purpose, config.apiKey!, signal, results => onProgress?.({ stage: "search", state: "completed", detail: query, sources: results.map(({ url, title }) => ({ url, title })) })) : undefined });
    };
    const findEpisode = tool({
        description: "Find a TV episode by its title, remembered plot, event or guest. Checks the relevant TMDB catalog and uses web evidence when enabled and needed. Returns a verified episode or asks for clarification. Never guess coordinates from memory.",
        inputSchema: z.object(queryFields),
        execute: resolve,
    });
    return {
        findEpisode,
        findEpisodeByTitle: tool({
            description: "Legacy episode lookup. Prefer findEpisode with episodeQuery for titles and descriptions.",
            inputSchema: z.object({ seriesQuery: z.string(), episodeTitle: z.string(), seasonNumber: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(10).optional() }),
            execute: (input, options) => resolve({ ...input, episodeQuery: input.episodeTitle }, options),
        }),
        navigateToEpisode: tool({
            description: "Open a TV episode. For a remembered title/event/plot/guest, pass episodeQuery with the user's description; resolves and verifies internally. Pass seasonNumber + episodeNumber only for user-provided or tool-verified coordinates. Do not turn your own episode guesses into coordinates.",
            inputSchema: z.object({ ...queryFields, episodeQuery: queryFields.episodeQuery.optional(), episodeNumber: z.number().int().min(1).optional() }),
            execute: async (input, options) => {
                if (input.episodeQuery) {
                    if (input.episodeNumber !== undefined) return { success: false, error: "Provide an episode description or explicit coordinates, not both." };
                    const resolved = await resolve({ ...input, episodeQuery: input.episodeQuery }, options);
                    if (!resolved.success) return resolved;
                    const episode = resolved.episodes[0];
                    const action = await navigateToMedia.execute!({ mediaId: episode.id, mediaType: "Episode" }, options);
                    return { ...action, mediaName: episode.title, mediaType: "Episode", seriesId: episode.seriesId,
                        seasonNumber: episode.seasonNumber, episodeNumber: episode.episodeNumber,
                        thumbnail: episode.thumbnail, evidence: resolved.evidence };
                }
                if (input.seasonNumber === undefined || input.episodeNumber === undefined) return { success: false, error: "Provide an episode description, or explicit season and episode numbers." };
                if (input.seriesId) {
                    const episode = await getTMDBEpisode(input.seriesId, input.seasonNumber, input.episodeNumber, options.abortSignal);
                    const action = await navigateToMedia.execute!({ mediaId: episode.id, mediaType: "Episode" }, options);
                    return { ...action, mediaName: episode.name, mediaType: "Episode", thumbnail: episode.thumbnail,
                        seasonNumber: input.seasonNumber, episodeNumber: input.episodeNumber };
                }
                if (!input.seriesQuery) return { success: false, error: "Provide the show title or its known series ID." };
                return navigateToEpisode.execute!({ seriesQuery: input.seriesQuery, seasonNumber: input.seasonNumber, episodeNumber: input.episodeNumber }, options);
            },
        }),
        playMedia: tool({
            description: `${playMedia.description} For an episode described by plot/event/guest/title, pass episodeQuery with the known series mediaId; it finds and verifies that episode before opening playback. Do not guess coordinates.`,
            inputSchema: playMediaInputSchema.extend({ episodeQuery: queryFields.episodeQuery.optional() }),
            execute: async (input, options) => {
                if (!input.episodeQuery) return playMedia.execute!(input, options);
                if (input.mediaType === "Movie" || input.episodeNumber !== undefined || input.streamId || input.streamUrl || input.selectionId || input.mediaSourceId) {
                    return { success: false, error: "For episode discovery, provide the series ID and description without coordinates or stream selections." };
                }
                const resolved = await resolve({ seriesId: input.seriesId || input.mediaId, episodeQuery: input.episodeQuery, seasonNumber: input.seasonNumber }, options);
                if (!resolved.success) return resolved;
                const episode = resolved.episodes[0];
                const action = await playMedia.execute!({ ...input, mediaId: episode.id, mediaName: resolved.seriesName!,
                    mediaType: "Episode", seriesId: episode.seriesId, showName: resolved.seriesName,
                    episodeTitle: episode.title, seasonNumber: episode.seasonNumber, episodeNumber: episode.episodeNumber }, options);
                return { ...action, thumbnail: episode.thumbnail, evidence: resolved.evidence };
            },
        }),
        searchMediaWeb: tool({
            description: "Fast TinyFish Search API: returns up to ten ranked results with titles, snippets and URLs immediately. Does not fetch or render pages. Use readMediaWebSources only for selected URLs when page evidence is needed. For search-result requests, return these results without fetching pages. Use getMediaDetails for ordinary metadata; episode actions use navigateToEpisode/playMedia with episodeQuery.",
            inputSchema: z.object({ query: z.string().min(1).max(1500), question: z.string().min(1).max(1500).describe("The media-information question the sources must answer") }),
            execute: async ({ query, question }, { abortSignal, context }) => {
                const config = await getTinyfishConfig();
                if (!config.enabled || !config.apiKey) return { success: false, error: "Enable TinyFish web search and configure its API key in Settings to research this question." };
                const progress = record(context).onEpisodeProgress as ((_progress: EpisodeProgress) => void) | undefined;
                progress?.({ stage: "search", state: "running" });
                try {
                    const started = Date.now();
                    const results = await searchTinyfish(query, question, config.apiKey, abortSignal);
                    progress?.({ stage: "search", state: results.length ? "completed" : "error", sources: results.map(({ url, title }) => ({ url, title })) });
                    return { success: !!results.length, results, count: results.length, searchMs: Date.now() - started, evidenceLevel: "search-results", ...(results.length ? {} : { error: "No search results found." }) };
                } catch (error) {
                    abortSignal?.throwIfAborted();
                    progress?.({ stage: "search", state: "error" });
                    return { success: false, error: error instanceof Error ? error.message : "Web search failed." };
                }
            },
        }),
        readMediaWebSources: tool({
            description: "Read selected public source URLs returned by searchMediaWeb when a claim needs page evidence. Fetch only the relevant pages, up to four per call. This is slower than search; do not call it just to list search results.",
            inputSchema: z.object({ urls: z.array(z.string().url()).min(1).max(4), question: z.string().min(1).max(1500) }),
            execute: async ({ urls, question }, { abortSignal, context }) => {
                const config = await getTinyfishConfig();
                if (!config.enabled || !config.apiKey) return { success: false, error: "Enable TinyFish web search and configure its API key in Settings." };
                const progress = record(context).onEpisodeProgress as ((_progress: EpisodeProgress) => void) | undefined;
                progress?.({ stage: "web", state: "running" });
                try {
                    const sources = await fetchMediaWebSources(urls, question, config.apiKey, abortSignal);
                    progress?.({ stage: "web", state: sources.length ? "completed" : "error", sources: sources.map(({ url, title }) => ({ url, title })) });
                    return { success: !!sources.length, sources, evidenceLevel: "page-content" };
                } catch (error) {
                    abortSignal?.throwIfAborted();
                    const message = error instanceof Error ? error.message : "Could not read these sources.";
                    progress?.({ stage: "web", state: "error", detail: message });
                    return { success: false, error: message };
                }
            },
        }),
    };
}
