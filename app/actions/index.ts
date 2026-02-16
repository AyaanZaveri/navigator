// Auth actions
export {
  authenticateUser,
  logout,
  getUser,
  isAuthenticated,
  getInstalledAddons,
  clearAuthData,
} from './auth';

// Media actions
export {
  fetchMovies,
  fetchTVShows,
  fetchMediaDetails,
  fetchResumeItems,
  reportPlaybackStart,
  reportPlaybackProgress,
  reportPlaybackStopped,
  fetchLibraryItems,
  fetchSimilarItems,
  fetchStreams,
  fetchCatalogItems,
  fetchGenres,
  scanLibrary,
} from './media';

// TV show actions
export {
  fetchSeasons,
  fetchEpisodes,
  fetchTVShowDetails,
  fetchEpisodeDetails,
} from './tv-shows';

// Search actions
export {
  searchItems,
  searchPeople,
  listSearchAddonTargets,
  searchCatalogSectionsForAddon,
  searchCatalogSections,
} from './search';

// Utility actions
export {
  getImageUrl,
  getDownloadUrl,
  getStreamUrl,
  getSubtitleTracks,
  getUserLibraries,
  getLibraryById,
  fetchRemoteImages,
  downloadRemoteImage,
  fetchCurrentImages,
  reorderBackdropImage,
  deleteImage,
  getUserWithPolicy,
} from './utils';

// Types
export type {
  RemoteImage,
  RemoteImagesResponse,
  CurrentImage,
  UserPolicy,
  UserWithPolicy,
} from './utils';
