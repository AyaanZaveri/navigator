import type { LogoOverlay, LogoRect } from './logo-backdrop';

export type LogoSurface = LogoOverlay | {
    source: string; rect: LogoRect; clip: LogoRect; opacity: number;
    objectPosition: string; objectFit: string;
};

const overlaps = (a: LogoRect, b: LogoRect) => a.left < b.left + b.width && a.left + a.width > b.left
    && a.top < b.top + b.height && a.top + a.height > b.top;
function intersect(a: LogoRect, b: LogoRect): LogoRect {
    const left = Math.max(a.left, b.left), top = Math.max(a.top, b.top);
    return { left, top, width: Math.max(0, Math.min(a.left + a.width, b.left + b.width) - left),
        height: Math.max(0, Math.min(a.top + a.height, b.top + b.height) - top) };
}

/** Collect the local page paint stack, not just the hero. Hit testing supplies
 * opaque card/container backgrounds; the image query includes pointer-free art. */
export function collectLogoSurfaces(scope: HTMLElement, header: HTMLElement, bounds: LogoRect,
    readStyle: (_element: Element) => CSSStyleDeclaration,
    hitTest: (_x: number, _y: number) => Element[],
): LogoSurface[] {
    const candidates = new Set<Element>(scope.querySelectorAll('img, [data-header-backdrop-fade]'));
    for (const x of [bounds.left, bounds.left + bounds.width / 2, bounds.left + bounds.width - 1]) {
        for (const y of [bounds.top, bounds.top + bounds.height / 2, bounds.top + bounds.height - 1]) {
            for (const element of hitTest(Math.max(0, x), Math.max(0, y))) candidates.add(element);
        }
    }
    const styles = new Map<Element, CSSStyleDeclaration>();
    const styleOf = (element: Element) => {
        let style = styles.get(element);
        if (!style) { style = readStyle(element); styles.set(element, style); }
        return style;
    };
    const layers: LogoSurface[] = [];
    const elements = [...candidates].filter(element => scope.contains(element) && !header.contains(element))
        .sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & 4 ? -1 : 1);
    for (const element of elements) {
        const rect = element.getBoundingClientRect();
        if (!overlaps(bounds, rect)) continue;
        let clip: LogoRect = rect;
        let opacity = 1;
        let visible = true;
        for (let ancestor: Element | null = element; ancestor && ancestor !== scope; ancestor = ancestor.parentElement) {
            const style = styleOf(ancestor);
            if (style.display === 'none' || style.visibility === 'hidden') { visible = false; break; }
            opacity *= Number(style.opacity || 1);
            if (ancestor !== element && /hidden|clip|auto|scroll/.test(`${style.overflowX} ${style.overflowY}`)) {
                clip = intersect(clip, ancestor.getBoundingClientRect());
            }
        }
        if (!visible || opacity <= 0 || !overlaps(bounds, clip)) continue;
        const style = styleOf(element);
        if (element.tagName === 'IMG') {
            const image = element as HTMLImageElement;
            const source = image.currentSrc || image.src;
            if (source) layers.push({ source, rect, clip, opacity,
                objectPosition: style.objectPosition || '50% 50%', objectFit: style.objectFit || 'fill' });
        } else {
            if (style.backgroundColor && style.backgroundColor !== 'transparent' && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                layers.push({ rect, clip, background: style.backgroundColor, opacity });
            }
            if (style.backgroundImage?.startsWith('linear-gradient(')) layers.push({ rect, clip, background: style.backgroundImage, opacity });
        }
    }
    return layers;
}
