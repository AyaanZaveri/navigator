/** Small bounded frame cache shared by both preview backends. */
export class PreviewCache {
    private frames = new Map<number, string>();
    private capacity: number;
    constructor(capacity = 96) { this.capacity = capacity; }
    get(time: number) {
        const value = this.frames.get(time);
        if (value) { this.frames.delete(time); this.frames.set(time, value); }
        return value;
    }
    set(time: number, src: string) {
        this.frames.delete(time);
        this.frames.set(time, src);
        while (this.frames.size > this.capacity) this.frames.delete(this.frames.keys().next().value!);
    }
    clear() { this.frames.clear(); }
}

export function previewBucket(time: number, duration: number) {
    if (!Number.isFinite(time) || time < 0 || !Number.isFinite(duration) || duration <= 0) return null;
    return Math.min(Math.floor(time / 2) * 2, Math.max(0, duration - 0.1));
}

export type PreviewMedia = HTMLVideoElement;

/** One independent, muted decoder. Coalesce pointer requests; never seek the playing media. */
export class BrowserPreviewFrames {
    readonly cache = new PreviewCache();
    private wanted: number | null = null;
    private decoding: number | null = null;
    private timer?: ReturnType<typeof setTimeout>;
    private closed = false;
    private context?: CanvasRenderingContext2D | null;
    private canvas?: HTMLCanvasElement;
    private video: PreviewMedia;
    private ready: (_time: number, _src: string | null, _videoFrame?: boolean, _unavailable?: boolean) => void;
    private preserveVideo: boolean;
    private allowCorsRetry: boolean;
    private retriedWithoutCors = false;
    private captureBlocked = false;
    constructor(video: PreviewMedia, ready: (_time: number, _src: string | null, _videoFrame?: boolean, _unavailable?: boolean) => void, preserveVideo = false, allowCorsRetry = false) {
        this.video = video; this.ready = ready; this.preserveVideo = preserveVideo; this.allowCorsRetry = allowCorsRetry;
        video.addEventListener('loadeddata', this.loaded);
        video.addEventListener('loadedmetadata', this.pump);
        video.addEventListener('seeked', this.captured);
        for (const event of ['canplay', 'timeupdate', 'progress']) video.addEventListener(event, this.loaded);
        video.addEventListener('error', this.failed);
    }
    want(time: number) {
        this.wanted = time;
        const cached = this.cache.get(time);
        if (cached) { this.ready(time, cached); return; }
        if (this.video.error) { this.failed(); return; }
        if (this.video.readyState < 1 && !this.timer) this.timer = setTimeout(this.failed, 6000);
        this.pump();
    }
    cancel() {
        this.wanted = null;
        if (this.decoding === null) { clearTimeout(this.timer); this.timer = undefined; }
    }
    private loaded = () => { if (this.decoding !== null) this.captured(); else this.pump(); };
    private pump = () => {
        if (this.closed || this.decoding !== null || this.wanted === null || this.video.readyState < 1) return;
        const target = this.wanted;
        const cached = this.cache.get(target);
        if (cached) { this.ready(target, cached); return; }
        this.decoding = target;
        clearTimeout(this.timer);
        this.timer = setTimeout(this.failed, 6000);
        if (Math.abs(this.video.currentTime - target) < 0.05 && this.video.readyState >= 2) this.captured();
        else {
            try {
                // Nearest keyframe is enough for a hover preview and is cheaper than frame-accurate seeking.
                const native = (this.video as unknown as { nativeEl?: HTMLVideoElement }).nativeEl ?? this.video;
                if (typeof native.fastSeek === 'function') native.fastSeek(target);
                else this.video.currentTime = target;
            } catch { this.failed(); }
        }
    };
    private captured = () => {
        if (this.closed || this.decoding === null || this.video.readyState < 2 || this.video.seeking) return;
        clearTimeout(this.timer);
        this.timer = undefined;
        const target = this.decoding;
        this.decoding = null;
        let src: string | null = null;
        try {
            if (!this.preserveVideo && !this.captureBlocked) {
                this.canvas ??= document.createElement('canvas');
                const width = this.video.videoWidth || 16, height = this.video.videoHeight || 9;
                const scale = Math.min(448 / width, 252 / height, 1);
                this.canvas.width = Math.max(1, Math.round(width * scale));
                this.canvas.height = Math.max(1, Math.round(height * scale));
                this.context ??= this.canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' });
                // mux-video exposes its actual video as nativeEl; plain video is its own source.
                const source = (this.video as unknown as { nativeEl?: HTMLVideoElement }).nativeEl ?? this.video;
                this.context?.drawImage(source, 0, 0, this.canvas.width, this.canvas.height);
                src = this.context ? this.canvas.toDataURL('image/jpeg', 0.72) : null;
            }
        } catch { this.captureBlocked = true; /* Display the decoded video when capture is forbidden. */ }
        if (src) this.cache.set(target, src);
        if (this.wanted === target) this.ready(target, src, !src);
        if (this.wanted !== null && this.wanted !== target) this.pump();
    };
    private failed = () => {
        clearTimeout(this.timer);
        this.timer = undefined;
        this.decoding = null;
        if (this.closed || this.wanted === null) return;
        // An older in-flight seek may fail after the pointer returns to cache.
        const cached = this.cache.get(this.wanted);
        if (cached) { this.ready(this.wanted, cached); return; }
        // CORS can reject a progressive video's anonymous load even when a
        // normal video element could play it. Retry once, then show that element
        // directly if canvas readback is forbidden. MSE manifests still need CORS.
        if (this.allowCorsRetry && !this.retriedWithoutCors && this.video.crossOrigin
            && this.video.error && this.video.error.code !== 3) {
            this.retriedWithoutCors = true;
            this.video.crossOrigin = null;
            this.video.load();
            this.timer = setTimeout(this.failed, 6000);
            return;
        }
        this.ready(this.wanted, null, false, !!this.video.error);
    };
    dispose() {
        this.closed = true;
        clearTimeout(this.timer);
        this.video.removeEventListener('loadeddata', this.loaded);
        this.video.removeEventListener('loadedmetadata', this.pump);
        this.video.removeEventListener('seeked', this.captured);
        for (const event of ['canplay', 'timeupdate', 'progress']) this.video.removeEventListener(event, this.loaded);
        this.video.removeEventListener('error', this.failed);
        this.video.pause();
        this.video.removeAttribute('src');
        this.video.load();
        this.cache.clear();
    }
}

/** Leading request is immediate; sustained movement gets the latest point every 60 ms. */
export class PreviewScheduler {
    private last = 0;
    private timer?: ReturnType<typeof setTimeout>;
    private pending?: () => void;
    want(time: number, request: (_time: number) => void) {
        this.pending = () => request(time);
        const delay = Math.max(0, 60 - (Date.now() - this.last));
        if (delay === 0) this.flush();
        else if (!this.timer) this.timer = setTimeout(this.flush, delay);
    }
    private flush = () => {
        clearTimeout(this.timer);
        this.timer = undefined;
        this.last = Date.now();
        const pending = this.pending;
        this.pending = undefined;
        pending?.();
    };
    cancel() { clearTimeout(this.timer); this.timer = undefined; this.pending = undefined; }
}
