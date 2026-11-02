/** Controls remain active even when a mouse stops moving over their hit area. */
export const playerControlSelector = '[data-slot="media-player-controls"], [data-player-close]';

export function playerControlsActive(root: HTMLElement | null) {
    if (root?.querySelector('[data-slot="media-player-controls"]:hover, [data-player-close]:hover')) return true;
    // Some track/cast menus are portalled and do not use the player's menu store.
    if (document.querySelector('[data-state="open"]:is([role="menu"], [role="dialog"], [role="listbox"], [data-slot="popover-content"])')) return true;
    const focused = document.activeElement;
    return focused instanceof Element && !!root?.contains(focused)
        && !!focused.closest(playerControlSelector) && focused.matches(':focus-visible');
}
