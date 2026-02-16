export interface ElectronAPI {
  platform: string;
  isElectron: boolean;
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => void;
  removeFullscreenListener: () => void;
  getFullscreenState: () => Promise<{ isFullscreen: boolean }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
