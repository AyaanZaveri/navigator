import { PreviewCache } from './preview-frames';
import type { CanvasSink, Input } from 'mediabunny';

/** Sparse WebCodecs decoding avoids a second full-size HTML video playback pipeline. */
export class RangePreviewFrames {
    readonly cache = new PreviewCache();
    private input?: Input;
    private sink?: CanvasSink;
    private wanted: number | null = null;
    private running = false;
    private closed = false;
    private timer?: ReturnType<typeof setTimeout>;
    private canvas?: HTMLCanvasElement;
    private source: string;
    private ready: (_time: number, _src: string) => void;
    private unavailable: () => void;
    constructor(source: string, ready: (_time: number, _src: string) => void, unavailable: () => void) {
        this.source = source; this.ready = ready; this.unavailable = unavailable;
    }
    want(time: number) {
        if (this.closed) return;
        this.wanted = time;
        const cached = this.cache.get(time);
        if (cached) { this.ready(time, cached); return; }
        void this.pump();
    }
    cancel() { this.wanted = null; }
    private async initialize() {
        if (this.sink) return this.sink;
        const { Input, UrlSource, CanvasSink, MP4, MATROSKA, WEBM, QTFF } = await import('mediabunny');
        if (this.closed) return;
        this.input = new Input({ formats: [MP4, MATROSKA, WEBM, QTFF], source: new UrlSource(this.source, {
            maxCacheSize: 16 * 1024 * 1024, parallelism: 1,
            getRetryDelay: attempts => attempts < 1 ? 0.5 : null,
            handleUnhandledError: () => this.fail(),
            fetchFn: (async (...args: Parameters<typeof fetch>) => {
                const [url, options] = args;
                const response = await fetch(url, options);
                // Do not download a multi-GB body from a server ignoring Range.
                if (response.ok && response.status !== 206 && new Headers(options?.headers).has('Range')) {
                    await response.body?.cancel();
                    throw new Error('Thumbnail extraction requires HTTP ranges');
                }
                return response;
            }) as typeof fetch,
        }) });
        const track = await this.input.getPrimaryVideoTrack();
        if (!track || !await track.canDecode()) throw new Error('WebCodecs cannot decode this stream');
        const width = await track.getDisplayWidth(), height = await track.getDisplayHeight();
        const scale = Math.min(448 / width, 252 / height, 1);
        this.sink = new CanvasSink(track, { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)),
            fit: 'contain', poolSize: 1, decoderOptions: { optimizeForLatency: true } });
        return this.sink;
    }
    private async pump() {
        if (this.running || this.closed || this.wanted === null) return;
        this.running = true;
        this.timer = setTimeout(() => this.fail(), 30000);
        try {
            const sink = await this.initialize();
            while (sink && !this.closed && this.wanted !== null) {
                const time: number = this.wanted;
                const cached = this.cache.get(time);
                if (cached) { this.ready(time, cached); break; }
                clearTimeout(this.timer);
                this.timer = setTimeout(() => this.fail(), 30000);
                const result = await sink.getCanvas(time);
                if (this.closed) break;
                if (!result) throw new Error('No frame at the requested time');
                this.canvas ??= document.createElement('canvas');
                this.canvas.width = result.canvas.width; this.canvas.height = result.canvas.height;
                const context = this.canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' });
                if (!context) throw new Error('Canvas unavailable');
                context.drawImage(result.canvas, 0, 0);
                const src = this.canvas.toDataURL('image/jpeg', 0.72);
                this.cache.set(time, src);
                if (this.wanted === time) { this.ready(time, src); break; }
                // A moving pointer skips obsolete positions; no parallel decoders.
            }
        } catch { if (!this.closed) this.fail(); }
        finally { clearTimeout(this.timer); this.timer = undefined; this.running = false; }
    }
    private fail() { if (!this.closed) { this.dispose(); this.unavailable(); } }
    dispose() {
        this.closed = true; this.wanted = null;
        clearTimeout(this.timer); this.timer = undefined;
        this.input?.dispose(); this.cache.clear();
    }
}
