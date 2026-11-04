type Task = {
    sources: string[];
    resolve: (_colors: string[] | null) => void;
    controller: AbortController;
};
let worker: Worker | null = null;
let sequence = 0;
let running: Task | null = null;
let queued: Task | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function disposeWorker() { worker?.terminate(); worker = null; }

async function quantize(pixels: Uint8ClampedArray): Promise<string[] | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            worker ??= new Worker(new URL("./palette.worker.ts", import.meta.url), { type: "module" });
            const current = worker, id = ++sequence;
            return await new Promise<string[] | null>((resolve, reject) => {
                const timeout = setTimeout(() => finish(new Error("Palette worker timed out")), 2000);
                const finish = (error?: Error, colors?: string[] | null) => {
                    clearTimeout(timeout);
                    current.onmessage = current.onerror = current.onmessageerror = null;
                    if (error) reject(error); else resolve(colors ?? null);
                };
                current.onmessage = event => { if (event.data.id === id) finish(undefined, event.data.colors); };
                current.onerror = event => { event.preventDefault(); finish(new Error("Palette worker failed")); };
                current.onmessageerror = () => finish(new Error("Palette worker response failed"));
                // Retain the small original buffer for one worker-restart retry.
                const copy = pixels.slice();
                try { current.postMessage({ id, pixels: copy }, [copy.buffer]); }
                catch (error) { finish(error instanceof Error ? error : new Error("Palette transfer failed")); }
            });
        } catch { disposeWorker(); }
    }
    return null;
}

function imagePixels(source: string, signal: AbortSignal): Promise<Uint8ClampedArray> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const timeout = setTimeout(() => finish(new Error("Palette image timed out")), 4000);
        function finish(error?: Error, pixels?: Uint8ClampedArray) {
            clearTimeout(timeout);
            signal.removeEventListener("abort", abort);
            image.onload = image.onerror = null;
            image.src = "";
            if (error || !pixels) reject(error ?? new Error("No palette pixels")); else resolve(pixels);
        }
        function abort() { finish(new Error("Palette selection superseded")); }
        image.crossOrigin = "anonymous";
        image.decoding = "async";
        image.onload = () => {
            try {
                const scale = Math.min(1, 160 / Math.max(image.naturalWidth, image.naturalHeight));
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
                canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
                const context = canvas.getContext("2d", { willReadFrequently: true });
                if (!context) throw new Error("Canvas unavailable");
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                finish(undefined, context.getImageData(0, 0, canvas.width, canvas.height).data);
            } catch (error) { finish(error instanceof Error ? error : new Error("Palette sample unreadable")); }
        };
        image.onerror = () => finish(new Error("Palette artwork unavailable"));
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort(); else image.src = source;
    });
}

async function drain() {
    if (running || !queued) return;
    clearTimeout(idleTimer);
    const task = running = queued;
    queued = null;
    let colors: string[] | null = null;
    try {
        for (const source of task.sources) {
            if (task.controller.signal.aborted) break;
            try {
                const pixels = await imagePixels(source, task.controller.signal);
                if (task.controller.signal.aborted) break;
                colors = await quantize(pixels);
                if (colors) break;
            } catch { /* Try the alternate artwork, unless superseded. */ }
        }
    } finally {
        task.resolve(task.controller.signal.aborted ? null : colors);
        running = null;
        if (queued) void drain();
        else idleTimer = setTimeout(disposeWorker, 30_000);
    }
}

/** One running job and the newest queued selection. Superseded image loads are
 * aborted; an already-running quantization finishes before the next job. */
export function extractHomePalette(sources: string[]): Promise<string[] | null> {
    return new Promise(resolve => {
        queued?.resolve(null);
        running?.controller.abort();
        queued = { sources, resolve, controller: new AbortController() };
        void drain();
    });
}
