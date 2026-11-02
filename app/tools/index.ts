// Import and re-export all tools
import type { JSONValue, LanguageModel, ToolSet } from "ai";
import { actionToolNames, modelToolOutput, record } from "@/lib/navigator-chat";
import { completeAction } from "./browser-action";
import { searchPeople, getPersonDetails, getFilmography } from "./people";
import {
    searchMedia,
    navigateToMedia,
    navigateToEpisode,
    findEpisodeByTitle,
    navigateToMediaByQuery,
    getMediaStreams,
    playMedia,
    getMediaDetails,
} from "./media";

import {
    getSeasons,
    getEpisodes,
} from "./tv-shows";

import {
    skipToSubtitleContent,
    createExplainScene,
    createAnalyzeMedia,
} from "./subtitles";

import {
    themeToggle,
} from "./theme";

import {
    createSystemPrompt,
} from "./system-prompt";

// Export all media-related tools
export {
    searchMedia,
    navigateToMedia,
    navigateToEpisode,
    findEpisodeByTitle,
    navigateToMediaByQuery,
    getMediaStreams,
    playMedia,
    getMediaDetails,
};

// Export all TV show-related tools
export {
    getSeasons,
    getEpisodes,
};

// Export subtitle tool factory functions
export {
    skipToSubtitleContent,
    createExplainScene,
    createAnalyzeMedia,
};

// Export theme tools
export {
    themeToggle,
};

// Export system prompt
export {
    createSystemPrompt,
};

// Factory function to create all tools with context
export function createAllTools(
    currentMedia: any,
    currentTimestamp?: number,
    analysisModel?: LanguageModel,
    abortSignal?: AbortSignal
): ToolSet {
    const baseTools = {
    // Media tools
        searchMedia,
        navigateToMedia,
        navigateToEpisode,
        findEpisodeByTitle,
        navigateToMediaByQuery,
        getMediaStreams,
        playMedia,
        getMediaDetails,
    
        // TV Show tools
        getSeasons,
        getEpisodes,
        searchPeople,
        getPersonDetails,
        getFilmography,

        // Theme tools
        themeToggle,
    };

    const definitions: ToolSet = {
        ...baseTools,
        // Keep schemas stable when replaying a conversation after playback closes.
        skipToSubtitleContent: skipToSubtitleContent(currentMedia ?? null, analysisModel, abortSignal),
        explainScene: createExplainScene(currentMedia ?? null, analysisModel, abortSignal, currentTimestamp),
        analyzeMedia: createAnalyzeMedia(currentMedia ?? null, analysisModel, abortSignal, currentTimestamp),
    };
    return {
        ...Object.fromEntries(Object.entries(definitions).map(([name, definition]) => [name, {
            ...definition,
            execute: definition.execute ? async (input: unknown, options: Parameters<NonNullable<typeof definition.execute>>[1]) => {
                options.abortSignal?.throwIfAborted();
                const output = await definition.execute!(input, options);
                options.abortSignal?.throwIfAborted();
                if (actionToolNames.has(name) && record(output).success === true) {
                    const { message: _message, ...action } = record(output);
                    return { ...action, preparedToolCallId: options.toolCallId, execution: "prepared" };
                }
                return output;
            } : undefined,
            toModelOutput: ({ output }: { output: unknown }) => ({ type: "json" as const, value: modelToolOutput(name, output) as JSONValue }),
        }])),
        completeAction,
    } satisfies ToolSet;
}
