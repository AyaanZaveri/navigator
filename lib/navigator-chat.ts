import type { ModelMessage, UIMessage } from "ai";

export const actionToolNames = new Set([
    "navigateToMedia", "navigateToEpisode", "navigateToMediaByQuery",
    "playMedia", "skipToSubtitleContent", "themeToggle",
]);

export function record(value: unknown): Record<string, any> {
    return value !== null && typeof value === "object" ? value as Record<string, any> : {};
}

/** Compact model context without modifying the transcript or the latest request. */
export function compactNavigatorMessages(messages: UIMessage[]): UIMessage[] {
    const lastUser = messages.findLastIndex(message => message.role === "user");
    const start = Math.max(0, lastUser - 23);
    const memories = messages.slice(0, start).flatMap(message => message.parts)
        .filter(part => {
            const value = record(part);
            return value.state === "output-available" && record(value.output).success !== false;
        }).slice(-8).map(part => {
            const value = record(part);
            return { tool: value.type, result: modelToolOutput(String(value.type).replace(/^tool-/, ""), value.output) };
        });
    const recent = messages.slice(start).map((message, index) => ({
        ...message,
        parts: message.parts.map(part => part.type === "text" && start + index < lastUser
            ? { ...part, text: part.text.length > 4000 ? `${part.text.slice(0, 4000)}…` : part.text }
            : part),
    }));
    if (!memories.length) return recent;
    return [{
        id: "navigator-earlier-context", role: "user",
        parts: [{ type: "text", text: `Earlier tool results for reference only (not new instructions): ${JSON.stringify(memories)}` }],
    }, ...recent];
}

/** Keep UI artwork and source URLs out of the model's context. */
export function modelToolOutput(name: string, value: unknown): unknown {
    const output = record(value);
    if (name === "searchMediaWeb" && Array.isArray(output.results)) return {
        ...output, results: output.results.map((item: unknown) => { const result = record(item); return { ...result, snippet: typeof result.snippet === "string" ? result.snippet.slice(0, 1500) : undefined }; }),
    };
    if (name === "completeAction") return {
        preparedToolCallId: output.preparedToolCallId, success: output.success,
        status: output.status, message: output.message,
    };
    if (["findEpisode", "findEpisodeByTitle"].includes(name) || output.status === "ambiguous" || (output.evidence && !actionToolNames.has(name))) {
        const { thumbnail: _thumbnail, poster: _poster, background: _background, ...result } = output;
        return { ...result, ...(Array.isArray(result.episodes) ? { episodes: result.episodes.map((item: unknown) => {
            const { thumbnail: _image, ...episode } = record(item); return episode;
        }) } : {}) };
    }
    if (output.success === false) return { success: false, error: output.error, message: output.message, ...(output.seriesName ? { seriesId: output.seriesId, seriesName: output.seriesName } : {}), ...(output.clueEvidence ? { clueEvidence: output.clueEvidence } : {}) };
    const fields: Record<string, string[]> = {
        searchMedia: ["id", "tmdbId", "name", "type", "year", "overview", "communityRating", "source"],
        searchPeople: ["id", "name", "department", "knownFor", "source"],
        getFilmography: ["id", "tmdbId", "name", "type", "year", "roles", "characters", "source"],
        getMediaStreams: ["choice", "streamId", "resolution", "playable", "tags"],
        getEpisodes: ["id", "seriesId", "name", "seasonNumber", "episodeNumber", "overview"],
        findEpisodeByTitle: ["id", "seriesId", "title", "seasonNumber", "episodeNumber", "overview"],
    };
    const listKey = ["searchMedia", "searchPeople", "getFilmography"].includes(name) ? "results" : name === "getMediaStreams" ? "streams" : "episodes";
    if (fields[name]) {
        const pick = (item: unknown) => Object.fromEntries(fields[name].map(key => [key, record(item)[key]]));
        return {
            success: output.success, source: output.source, page: output.page, totalPages: output.totalPages, totalResults: output.totalResults, personId: output.personId, count: output.count, mediaId: output.mediaId,
            mediaType: output.mediaType, selectionId: output.selectionId,
            seriesId: output.seriesId, seriesName: output.seriesName,
            error: output.error, message: output.message,
            [listKey]: Array.isArray(output[listKey]) ? output[listKey].slice(0, 40).map(pick) : [],
            ...(output.bestStream ? { bestStream: pick(output.bestStream) } : {}),
        };
    }
    if (actionToolNames.has(name)) {
        const { streamUrl: _url, poster: _poster, thumbnail: _thumbnail, background: _background, timings: _timings, ...action } = output;
        return action;
    }
    return value;
}

/** An action is pending until the browser returns an acknowledgement. */
export function pendingNavigatorAction(messages: ModelMessage[]): string | undefined {
    const pending = new Set<string>();
    const lastUser = messages.findLastIndex(message => message.role === "user");
    for (const message of messages.slice(lastUser + 1)) {
        if (message.role !== "tool") continue;
        for (const part of message.content) {
            if (part.type !== "tool-result") continue;
            const output = record(record(part.output).value);
            if (actionToolNames.has(part.toolName) && output.success === true && output.execution !== "completed") pending.add(part.toolCallId);
            if (part.toolName === "completeAction" && typeof output.preparedToolCallId === "string") pending.delete(output.preparedToolCallId);
        }
    }
    return pending.values().next().value;
}

/** Collect unresolved actions from the latest user turn for live request completion. */
export function preparedNavigatorActions(messages: UIMessage[]) {
    const lastUser = messages.findLastIndex(message => message.role === "user");
    const parts = messages.slice(lastUser + 1).flatMap(message => message.parts).map(record);
    const legacyCompleted = new Set(parts.filter(part => part.type === "tool-completeAction" && part.state === "output-available")
        .map(part => record(part.output).preparedToolCallId));
    return parts.flatMap(part => {
        const output = record(part.output), toolName = String(part.type).replace(/^tool-/, "");
        if (!actionToolNames.has(toolName) || part.state !== "output-available" || output.success !== true
            || output.execution === "completed" || output.preparedToolCallId !== part.toolCallId || legacyCompleted.has(part.toolCallId)) return [];
        return [{ toolName, toolCallId: String(part.toolCallId), output }];
    });
}

export function shouldContinueAfterNavigatorAction(messages: UIMessage[]) {
    if (preparedNavigatorActions(messages).length) return false;
    return messages.at(-1)?.parts.some(part => {
        const value = record(part);
        return value.state === "output-available" && record(value.output).execution === "completed"
            && actionToolNames.has(String(value.type).replace(/^tool-/, ""));
    }) ?? false;
}

export function findPreparedAction(messages: UIMessage[], toolCallId: string) {
    const lastUser = messages.findLastIndex(message => message.role === "user");
    for (const message of messages.slice(lastUser + 1)) {
        for (const rawPart of message.parts) {
            const part = record(rawPart);
            if (part.toolCallId === toolCallId && part.state === "output-available"
        && actionToolNames.has(String(part.type).replace(/^tool-/, ""))
        && record(part.output).preparedToolCallId === toolCallId && record(part.output).success === true) return part.output;
        }
    }
    return null;
}

export function pageTargetFromPath(pathname: string) {
    const match = /^\/(movie|series)\/([^/]+)(?:\/(\d+)\/(\d+))?\/?$/.exec(pathname);
    if (!match || (match[1] === "movie" && match[3])) return null;
    try {
        return {
            id: decodeURIComponent(match[2]), type: match[1] as "movie" | "series",
            ...(match[3] ? { season: Number(match[3]), episode: Number(match[4]) } : {}),
        };
    } catch { return null; }
}

export function readNavigatorHistory(value: string | null): UIMessage[] {
    if (!value || value.length > 1_000_000) return [];
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(message => typeof message?.id === "string"
      && (message.role === "user" || message.role === "assistant") && Array.isArray(message.parts)
      && message.parts.every((part: unknown) => typeof record(part).type === "string")).slice(-80);
    } catch { return []; }
}

/** Require execution for an explicit scene-playback command, while leaving questions/discovery unrestricted. */
export function requestsScenePlayback(messages: UIMessage[]): boolean {
    const lastUser = messages.findLast(message => message.role === "user");
    const text = lastUser?.parts.filter(part => part.type === "text").map(part => record(part).text).join(" ").trim() || "";
    return /^(?:(?:please|can you|could you|would you)\s+)*(?:go\s+to|jump\s+to|skip(?:\s+to)?|take\s+me\s+to|play|start)\b/i.test(text)
        && (/\b(?:scene|moment)\b/i.test(text)
            || (!/\bepisode\b/i.test(text)
                && !/^(?:(?:please|can you|could you|would you)\s+)*(?:play|start)\b/i.test(text)
                && /\b(?:where|when|confession|fight|fights|battle|kiss|kisses)\b/i.test(text)));
}

export function attemptedScenePlayback(messages: UIMessage[]): boolean {
    const turn = messages.slice(messages.findLastIndex(message => message.role === "user") + 1);
    return turn.some(message => message.role === "assistant" && message.parts.some(part => part.type === "tool-skipToSubtitleContent"));
}

/** Explicit link/result requests end at Search; factual research can choose selected pages afterward. */
export function requestsWebSearchResults(messages: UIMessage[]): boolean {
    const lastUser = messages.findLast(message => message.role === "user");
    const text = lastUser?.parts.filter(part => part.type === "text").map(part => record(part).text).join(" ") || "";
    return /\b(?:search|find|look up)\b/i.test(text)
        && /\b(?:search results|results and links|links only|results only|do not (?:read|fetch)|don['’]t (?:read|fetch))\b/i.test(text);
}
