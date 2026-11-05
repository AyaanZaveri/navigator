import type { UIMessage } from "ai";
import { compactNavigatorMessages, modelToolOutput, record } from "./navigator-chat";

export interface SceneRequestContext {
    originalRequest: string;
    conversation: Array<{ role: string; text: string }>;
    titleReferences: unknown[];
    verifiedEpisodeEvidence?: Array<{ episodeId: string; quote: string; title: string }>;
}

/** Use the canonical tool input, before playback converts TMDB into IMDb IDs. */
export function verifiedSceneEvidence(context: SceneRequestContext | undefined, mediaId: string | undefined,
    seasonNumber?: number, episodeNumber?: number) {
    if (!mediaId) return [];
    const ids = new Set([mediaId]);
    if (Number.isInteger(seasonNumber) && Number.isInteger(episodeNumber)) ids.add(`${mediaId}:${seasonNumber}:${episodeNumber}`);
    return context?.verifiedEpisodeEvidence?.filter(item => ids.has(item.episodeId)) ?? [];
}

/** Server-owned context, independent of the model's extracted tool arguments. */
export function sceneRequestContext(messages: UIMessage[]): SceneRequestContext {
    const lastUser = messages.findLastIndex(message => message.role === "user");
    const text = (message: UIMessage) => message.parts.filter(part => part.type === "text").map(part => part.text).join("\n");
    const earlier = lastUser < 0 ? [] : messages.slice(0, lastUser);
    const referenceTools = new Set(["searchMedia", "findEpisode", "findEpisodeByTitle", "getEpisodes", "playMedia", "skipToSubtitleContent"]);
    return {
        // Never truncate or regenerate the latest user's words.
        originalRequest: lastUser < 0 ? "" : text(messages[lastUser]),
        conversation: compactNavigatorMessages(earlier).filter(message => message.id !== "navigator-earlier-context")
            .filter(message => message.role === "user" || message.role === "assistant")
            .map(message => ({ role: message.role, text: text(message).slice(0, 4000) }))
            .filter(message => message.text.length > 0).slice(-12),
        titleReferences: earlier.flatMap(message => message.parts).flatMap(part => {
            const value = record(part);
            const name = String(value.type).replace(/^tool-/, "");
            if (!referenceTools.has(name) || value.state !== "output-available" || record(value.output).success === false) return [];
            const output = record(modelToolOutput(name, value.output));
            // Identity only: no signed URLs, credentials, subtitle files or diagnostic payloads.
            const identity = (item: unknown) => {
                const data = record(item);
                return Object.fromEntries(["id", "mediaId", "seriesId", "name", "title", "mediaName", "seriesName", "showName", "episodeTitle", "seasonNumber", "episodeNumber", "year", "type"]
                    .filter(key => typeof data[key] === "string" || typeof data[key] === "number").map(key => [key, data[key]]));
            };
            return [{ tool: name, ...identity(output),
                titles: (Array.isArray(output.results) ? output.results : Array.isArray(output.episodes) ? output.episodes : []).slice(0, 8).map(identity) }];
        }).slice(-8),
    };
}
