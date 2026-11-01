export type NativeTrack = {
  id: number;
  type: "audio" | "sub" | "video";
  title?: string;
  lang?: string;
  selected?: boolean;
};

export type NativeState = {
  position: number;
  duration: number;
  paused: boolean;
  volume: number;
  muted: boolean;
  rate: number;
  buffering: boolean;
  seeking: boolean;
  buffered: number;
  width: number;
  height: number;
};

export type NativeMessage =
  | { type: "scrub"; session: string; active: boolean; position: number; duration: number; x: number; speed?: number; commit?: boolean }
  | { type: "state"; session: string; state: NativeState }
  | { type: "tracks"; session: string; tracks: NativeTrack[] }
  | { type: "subtitle"; session: string; text: string }
  | { type: "thumbnail-frame"; session: string; position: number; src: string }
  | { type: "thumbnail"; session: string; request: number; src: string | null; position: number | null }
  | { type: "loading" | "loaded" | "ready" | "ended"; session: string }
  | { type: "error"; session: string; message: string }
  | { type: "fullscreen"; value: boolean };

export type NativeRequest =
  | { type: "load"; session: string; url: string; headers?: Record<string, string> }
  | { type: "play" | "pause" | "stop"; session: string }
  | { type: "seek"; session: string; position: number }
  | { type: "thumbnail"; session: string; request: number; position: number | null }
  | { type: "volume"; session: string; volume: number }
  | { type: "muted"; session: string; muted: boolean }
  | { type: "rate"; session: string; rate: number }
  | { type: "track"; session: string; kind: "audio" | "subtitle"; id: string }
  | { type: "fullscreen"; value: boolean }
  | { type: "window-drag" }
  | { type: "settings" }
  | { type: "seek-feedback"; session: string };

export interface DesktopBridge {
  readonly protocol: 1;
  readonly platform: "macos" | "windows" | "linux" | "android";
  readonly engine?: "mpv" | "exoplayer";
  readonly fullscreen: boolean;
  send(request: NativeRequest): void;
  subscribe(listener: (message: NativeMessage) => void): () => void;
}

declare global {
  interface Window { readonly navigatorDesktop?: DesktopBridge }
}

export function desktopBridge(): DesktopBridge | undefined {
  if (typeof window === "undefined") return undefined;
  const bridge = window.navigatorDesktop;
  return bridge?.protocol === 1 ? bridge : undefined;
}
