"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import MuxVideo from "@mux/mux-video-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { MpvElementHandle } from "@/lib/desktop/mpv-element";
import { BrowserPreviewFrames, PreviewCache, PreviewScheduler, previewBucket, type PreviewMedia } from "@/lib/media/preview-frames";

type Props = { media: HTMLVideoElement | HTMLAudioElement | null; time: number; duration: number; active: boolean };
type Frame = { time: number | null; src: string | null; video: boolean; unavailable: boolean };
const empty: Frame = { time: null, src: null, video: false, unavailable: false };

/** Kept mounted across hover exits so decoder buffers and recent frames stay warm. */
export function SeekPreview({ media, time, duration, active }: Props) {
    const source = media?.getAttribute("src") || media?.src || "";
    const session = (media as unknown as MpvElementHandle | null)?.controller?.previewSession;
    return <PreviewSource key={session || source} media={media} source={source} time={time} duration={duration} active={active} />;
}

function PreviewSource({ media, source, time, duration, active }: Props & { source: string }) {
    const native = (media as unknown as MpvElementHandle | null)?.controller;
    const [fallback, setFallback] = useState(false);
    const videoNode = useRef<PreviewMedia | null>(null);
    const [videoAttached, setVideoAttached] = useState(false);
    const videoRef = useCallback((node: unknown) => { videoNode.current = node as PreviewMedia | null; setVideoAttached(!!node); }, []);
    const [frame, setFrame] = useState<Frame>(empty);
    const cache = useRef(new PreviewCache());
    const browser = useRef<BrowserPreviewFrames | null>(null);
    const scheduler = useRef(new PreviewScheduler());
    const ticket = useRef(0);
    const invalidate = useCallback(() => { ticket.current++; }, []);
    const bucket = previewBucket(time, duration);
    const androidNative = !!native && typeof window !== "undefined" && window.navigatorDesktop?.platform === "android";
    const browserMode = !native || fallback || (!androidNative && /\.(m3u8|mpd)(?:[?#]|$)/i.test(source));
    const wanted = useRef<number | null>(null);
    useLayoutEffect(() => { wanted.current = active ? bucket : null; }, [active, bucket]);

    useLayoutEffect(() => {
        if (!androidNative || !native) return;
        const receive = (event: Event) => {
            const { position, src } = (event as CustomEvent<{ position: number; src: string }>).detail;
            cache.current.set(position, src);
            if (wanted.current !== null) setFrame({ time: position, src, video: false, unavailable: false });
        };
        native.addEventListener("previewframe", receive);
        return () => native.removeEventListener("previewframe", receive);
    }, [androidNative, native]);

    useLayoutEffect(() => {
        const requests = scheduler.current;
        return () => { requests.cancel(); invalidate(); native?.cancelPreview(); };
    }, [source, native, invalidate]);

    useLayoutEffect(() => {
        const video = videoNode.current;
        if (!browserMode || !videoAttached || !video || !source) return;
        const provider = new BrowserPreviewFrames(video, (at, src, videoFrame) => {
            if (wanted.current !== null) setFrame({ time: at, src, video: !!videoFrame, unavailable: !src && !videoFrame });
        }, window.matchMedia("(dynamic-range: high)").matches);
        browser.current = provider;
        // Restore the source after Strict Mode's effect cleanup on the same element.
        video.muted = true;
        if (video.getAttribute("src") !== source) video.src = source;
        return () => { provider.dispose(); if (browser.current === provider) browser.current = null; };
    }, [browserMode, videoAttached, source]);

    useLayoutEffect(() => {
        if (!active || bucket === null || !source) {
            scheduler.current.cancel();
            invalidate();
            native?.cancelPreview();
            browser.current?.cancel();
            return;
        }
        if (browserMode) {
            if (!browser.current) return;
            scheduler.current.want(bucket, (at) => browser.current?.want(at));
            return;
        }
        const cached = cache.current.get(bucket);
        if (cached) {
            scheduler.current.cancel();
            native?.cancelPreview();
            const generation = ++ticket.current;
            Promise.resolve(cached).then((src) => { if (generation === ticket.current) setFrame({ time: bucket, src, video: false, unavailable: false }); });
            return;
        }
        scheduler.current.want(bucket, (at) => {
            const generation = ++ticket.current;
            native?.preview(at).then((src) => {
                if (generation !== ticket.current) return;
                if (src) {
                    cache.current.set(at, src);
                    setFrame({ time: at, src, video: false, unavailable: false });
                } else {
                    // HLS or an unsupported container can still use the WebView decoder.
                    if (androidNative) setFrame((previous) => previous.src ? previous : { time: at, src: null, video: false, unavailable: true });
                    else setFallback(true);
                }
            });
        });
    }, [active, bucket, source, native, browserMode, videoAttached, invalidate, androidNative]);

    const ready = (androidNative && !!frame.src) || (frame.time === bucket && !frame.unavailable);
    const unavailable = frame.time === bucket && frame.unavailable;
    return (
        <div data-slot="media-player-seek-thumbnail" data-native-preview-provider={androidNative ? "android" : undefined} aria-busy={active && !ready && !unavailable} className="relative h-32 w-56 overflow-hidden rounded-t-md bg-black">
            {browserMode && source && (
                <MuxVideo
                    ref={videoRef}
                    src={source} muted playsInline preload="metadata" crossOrigin="anonymous" disablePictureInPicture disableRemotePlayback disableTracking
                    aria-hidden="true" tabIndex={-1}
                    className={`pointer-events-none absolute inset-0 size-full object-contain ${frame.video ? "opacity-100" : "opacity-0"}`}
                />
            )}
            {frame.src && <img src={frame.src} alt="" className="absolute inset-0 size-full object-contain" draggable={false} />}
            {!ready && !unavailable && <Skeleton className="absolute inset-0 size-full rounded-none bg-white/10" />}
            {unavailable && <div className="absolute inset-0 flex items-center justify-center text-xs text-white/60">Preview unavailable</div>}
        </div>
    );
}
