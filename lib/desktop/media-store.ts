import { createMediaStore } from "media-chrome/dist/media-store/media-store";
import { stateMediator } from "media-chrome/dist/media-store/state-mediator";
import { desktopBridge } from "./bridge";

/** Native fullscreen keeps the video and the web view in the same OS window. */
export function createDesktopMediaStore() {
  return createMediaStore({
    stateMediator: {
      ...stateMediator,
      mediaIsFullscreen: {
        get: () => desktopBridge()?.fullscreen ?? false,
        set: (value: boolean) => desktopBridge()?.send({ type: "fullscreen", value }),
        rootEvents: ["navigatorfullscreenchange"],
      },
      mediaFullscreenUnavailable: { get: () => undefined },
    },
  });
}
