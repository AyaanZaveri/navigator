const selector = '[data-player-glass], [data-player-hdr-glass]';
const properties = ['image', 'x', 'y', 'size', 'half-width', 'height', 'color', 'sheen'];
const videoEvents = ['loadeddata', 'seeked', 'playing', 'pause'];

/** Chromium can composite HDR video outside the pixels available to backdrop-filter.
 * Supply small sRGB samples to the glass only; the playing video stays in HDR. */
export function attachBrowserPlayerGlass(video: HTMLVideoElement) {
    let hdr = false, inspected = false, blocked = false, closed = false;
    let callback: number | undefined, lastSample = -Infinity, image: string | undefined;
    let visible: HTMLElement[] = [];
    const painted = new Set<HTMLElement>();
    let canvas: HTMLCanvasElement | undefined;
    let context: CanvasRenderingContext2D | null | undefined;
    const resized = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => refresh());
    const stop = () => {
        if (callback !== undefined) video.cancelVideoFrameCallback(callback);
        callback = undefined;
    };
    const clear = () => {
        for (const node of painted) {
            node.removeAttribute('data-browser-glass');
            for (const property of properties) node.style.removeProperty(`--browser-glass-${property}`);
        }
        painted.clear();
    };
    const inspect = () => {
        if (inspected || video.readyState < 2 || typeof VideoFrame === 'undefined') return;
        let frame: VideoFrame | undefined;
        try {
            frame = new VideoFrame(video);
            // Older DOM typings omit pq/hlg; accept their codec names as well.
            const transfer = String(frame.colorSpace.transfer);
            hdr = ['pq', 'hlg', 'smpte2084', 'arib-std-b67'].includes(transfer);
            inspected = true;
        } catch { /* A protected/cross-origin frame retains normal CSS glass. */ }
        finally { frame?.close(); }
    };
    const sample = () => {
        if (blocked || !hdr || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
        try {
            canvas ??= document.createElement('canvas');
            const width = window.innerWidth, height = window.innerHeight;
            if (!width || !height) return;
            const scale = Math.min(640 / width, 360 / height, 1);
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            context ??= canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' });
            if (!context) { blocked = true; return; }
            // Include the same black bars and framing as the playing video.
            context.fillStyle = '#000';
            context.fillRect(0, 0, canvas.width, canvas.height);
            const rect = video.getBoundingClientRect();
            const fit = getComputedStyle(video).objectFit;
            const ratio = (fit === 'cover' ? Math.max : Math.min)(rect.width / video.videoWidth, rect.height / video.videoHeight);
            const drawnWidth = fit === 'fill' ? rect.width : video.videoWidth * ratio;
            const drawnHeight = fit === 'fill' ? rect.height : video.videoHeight * ratio;
            context.save();
            context.beginPath();
            context.rect(rect.left * scale, rect.top * scale, rect.width * scale, rect.height * scale);
            context.clip();
            context.drawImage(video, (rect.left + (rect.width - drawnWidth) / 2) * scale,
                (rect.top + (rect.height - drawnHeight) / 2) * scale, drawnWidth * scale, drawnHeight * scale);
            context.restore();
            image = `url("${canvas.toDataURL('image/jpeg', 0.75)}")`;
            for (const node of visible) {
                node.style.setProperty('--browser-glass-image', image);
                node.setAttribute('data-browser-glass', '');
                painted.add(node);
            }
        } catch {
            blocked = true;
            clear();
            stop();
        }
    };
    const tick = (now: number) => {
        callback = undefined;
        if (closed || blocked || document.hidden || !visible.length) return;
        if (now - lastSample >= 250) { lastSample = now; sample(); }
        if (!blocked) callback = video.requestVideoFrameCallback(tick);
    };
    const refresh = () => {
        if (closed) return;
        inspect();
        visible = hdr && !blocked && !document.hidden
            ? [...document.querySelectorAll<HTMLElement>(selector)].filter(node => node.getAttribute('aria-hidden') !== 'true'
                && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden') : [];
        if (!visible.length) { stop(); return; }
        for (const node of visible) {
            const style = getComputedStyle(node);
            // Preserve each surface's theme/tint before replacing its background.
            if (!painted.has(node)) {
                node.style.setProperty('--browser-glass-color', style.backgroundColor);
                node.style.setProperty('--browser-glass-sheen', style.backgroundImage);
                resized?.observe(node);
            }
            if (node.getAttribute('data-slot') !== 'media-player-seek-tooltip') {
                const rect = node.getBoundingClientRect();
                node.style.setProperty('--browser-glass-x', `${-rect.left}px`);
                node.style.setProperty('--browser-glass-y', `${-rect.top}px`);
            }
            node.style.setProperty('--browser-glass-size', `${window.innerWidth}px ${window.innerHeight}px`);
            node.style.setProperty('--browser-glass-half-width', `${window.innerWidth / 2}px`);
            node.style.setProperty('--browser-glass-height', `${window.innerHeight}px`);
            painted.add(node);
        }
        // Also paints paused video, newly opened Navigator and freshly revealed controls.
        if (!image) sample();
        else for (const node of visible) {
            node.style.setProperty('--browser-glass-image', image);
            node.setAttribute('data-browser-glass', '');
        }
        if (!blocked && callback === undefined && typeof video.requestVideoFrameCallback === 'function') {
            callback = video.requestVideoFrameCallback(tick);
        }
    };
    const observer = new MutationObserver(records => {
        if (records.some(record => record.attributeName === 'data-player-video-fit')) image = undefined;
        if (!records.length || records.some(record => record.type === 'attributes'
            || [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1))) refresh();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true,
        attributeFilter: ['data-controls-visible', 'aria-hidden', 'data-player-hdr-glass', 'data-player-video-fit'] });
    const repaint = () => { image = undefined; refresh(); };
    for (const event of videoEvents) video.addEventListener(event, repaint);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('resize', repaint);
    refresh();
    return () => {
        closed = true;
        stop();
        observer.disconnect();
        resized?.disconnect();
        for (const event of videoEvents) video.removeEventListener(event, repaint);
        document.removeEventListener('visibilitychange', refresh);
        window.removeEventListener('resize', repaint);
        clear();
    };
}
