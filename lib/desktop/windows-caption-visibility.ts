import type { DesktopBridge } from './bridge';

/** Follow the player's existing chrome state, including its loading overlay. */
export function watchWindowsCaptionVisibility(bridge: DesktopBridge, onChange: (visible: boolean) => void) {
    if (typeof document === 'undefined') return () => {};
    let previous: boolean | undefined;
    let pointerWithin = false;
    const nativeVisibility = bridge.capabilities?.windowControlsVisibility;
    const update = () => {
        const player = document.querySelector('[data-player-shell]');
        const media = player?.querySelector('[data-slot="media-player"]');
        const loading = !!player?.querySelector('[data-player-loading-copy]');
        // Caption controls are outside the player root. Entering them fires the
        // player's mouseleave, so their own interaction must hold visibility.
        const captionHover = pointerWithin || !!document.documentElement.dataset.windowControlHover;
        const visible = !player || loading || !media || media.hasAttribute('data-controls-visible') || captionHover;
        if (visible === previous) return;
        previous = visible;
        onChange(visible);
        if (nativeVisibility) bridge.send({ type: 'window-controls-visible', visible });
    };
    const onPointer = (event: PointerEvent) => {
        const rect = document.querySelector('[aria-label="Window controls"]')?.getBoundingClientRect();
        pointerWithin = previous !== false && !!rect && event.clientX >= rect.left && event.clientX < rect.right
            && event.clientY >= rect.top && event.clientY < rect.bottom;
        update();
    };
    const onBlur = () => { pointerWithin = false; update(); };
    // Capture pointerout before React's player mouseleave can hide the caption.
    const pointerEvents = ['pointermove', 'pointerover', 'pointerout'] as const;
    for (const type of pointerEvents) document.addEventListener(type, onPointer, true);
    window.addEventListener('blur', onBlur);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
        subtree: true, childList: true, attributes: true,
        attributeFilter: ['data-controls-visible', 'data-native-playing', 'data-window-control-hover'],
    });
    update();
    return () => {
        observer.disconnect();
        for (const type of pointerEvents) document.removeEventListener(type, onPointer, true);
        window.removeEventListener('blur', onBlur);
        if (nativeVisibility) bridge.send({ type: 'window-controls-visible', visible: true });
    };
}
