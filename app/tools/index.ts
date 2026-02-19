// Import and re-export all tools
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
  analysisModel?: any
) {
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

    // Theme tools
    themeToggle,
  };

  if (!currentMedia) {
    return baseTools;
  }

  return {
    ...baseTools,
    // Subtitle tools are available only while media is actively playing.
    skipToSubtitleContent: skipToSubtitleContent(currentMedia, analysisModel),
    explainScene: createExplainScene(currentMedia, analysisModel),
    analyzeMedia: createAnalyzeMedia(currentMedia, analysisModel),
  };
}
