"use client";

import React, { useLayoutEffect, useRef } from "react";
import { MPV_TAG, registerMpvElement, type MpvElementHandle } from "@/lib/desktop/mpv-element";
import { useComposedRefs } from "@/lib/compose-refs";

type Props = Omit<React.ComponentProps<"video">, "src"> & { src?: string; requestHeaders?: Record<string, string>; startPosition?: number };

export function MpvVideo({ src, requestHeaders, startPosition = 0, ref, onPause, onEnded, onLoadedMetadata, onTimeUpdate, onDurationChange, onCanPlay, onLoadedData, onError, autoPlay: _autoPlay, crossOrigin: _crossOrigin, playsInline: _playsInline, preload: _preload, ...props }: Props) {
  registerMpvElement();
  const element = useRef<MpvElementHandle | null>(null);
  // Existing controls use the media element contract supplied by this custom element.
  const composed = useComposedRefs(element, ref as React.Ref<MpvElementHandle>);
  const callbacks = useRef({ onPause, onEnded, onLoadedMetadata, onTimeUpdate, onDurationChange, onCanPlay, onLoadedData, onError });
  callbacks.current = { onPause, onEnded, onLoadedMetadata, onTimeUpdate, onDurationChange, onCanPlay, onLoadedData, onError };
  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    const listeners = Object.entries({ pause: "onPause", ended: "onEnded", loadedmetadata: "onLoadedMetadata", timeupdate: "onTimeUpdate", durationchange: "onDurationChange", canplay: "onCanPlay", loadeddata: "onLoadedData", error: "onError" }).map(([event, key]) => {
      const listener = (nativeEvent: Event) => {
        const callback = callbacks.current[key as keyof typeof callbacks.current];
        callback?.({ nativeEvent, currentTarget: node, target: node } as unknown as React.SyntheticEvent<HTMLVideoElement>);
      };
      node.addEventListener(event, listener);
      return () => node.removeEventListener(event, listener);
    });
    return () => listeners.forEach((remove) => remove());
  }, []);
  const headersKey = JSON.stringify(requestHeaders ?? {});
  useLayoutEffect(() => {
    const controller = element.current?.controller;
    if (src) controller?.load(src, JSON.parse(headersKey), startPosition);
    // Disconnect owns final cleanup. A source change reuses the controller with a new session.
  }, [src, headersKey, startPosition]);
  return React.createElement(MPV_TAG, { ...props, ref: composed, "data-native-video": "" });
}
