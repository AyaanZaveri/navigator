/** Promote the row's existing responsive images, rather than fetching duplicate
 * URLs. Limit speculative promotions; visible images retain native lazy loading. */
export function warmCarouselArtwork(viewport: HTMLElement): () => void {
  const active = new Map<HTMLImageElement, () => void>();
  let near = typeof IntersectionObserver === "undefined";
  let disposed = false;
  let frame = 0;
  let previousLeft = viewport.scrollLeft;
  let direction = 1;

  function schedule() {
    if (!disposed && !frame) frame = requestAnimationFrame(update);
  }

  function update() {
    frame = 0;
    if (disposed || !near) return;
    const bounds = viewport.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    if (viewport.scrollLeft !== previousLeft) direction = viewport.scrollLeft > previousLeft ? 1 : -1;
    previousLeft = viewport.scrollLeft;

    // Read every candidate before writing loading/priority attributes.
    const artwork = Array.from(viewport.querySelectorAll<HTMLImageElement>("img[data-prefetch-artwork]"))
      .filter(image => image.isConnected && !image.complete)
      .map(image => {
        const rect = image.getBoundingClientRect();
        const visible = rect.right > bounds.left && rect.left < bounds.right;
        const ahead = direction > 0 ? rect.left >= bounds.right : rect.right <= bounds.left;
        return { image, rect, visible, rank: visible ? 0 : ahead ? 1 : 2,
          distance: Math.max(bounds.left - rect.right, rect.left - bounds.right, 0) };
      });
    // A low-priority lookahead request becomes normal priority once scrolled in.
    artwork.forEach(({ image, visible }) => {
      if (visible && active.has(image)) image.fetchPriority = "auto";
    });
    const candidates = artwork
      .filter(({ image }) => image.loading === "lazy" && !active.has(image))
      .filter(({ rect }) => rect.right > bounds.left - 640 && rect.left < bounds.right + 640)
      .sort((a, b) => a.rank - b.rank || a.distance - b.distance);

    for (const { image, visible } of candidates) {
      if (active.size >= 4) break;
      const off = () => {
        image.removeEventListener("load", finish);
        image.removeEventListener("error", finish);
      };
      const finish = () => {
        if (!active.delete(image)) return;
        off();
        schedule();
      };
      active.set(image, off);
      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", finish, { once: true });
      image.fetchPriority = visible ? "auto" : "low";
      image.loading = "eager";
      if (image.complete) finish();
    }
  }

  // A horizontal root alone would also warm a row far below the page. Use the
  // actual page scroller so its clipping doesn't erase our vertical head start.
  const pageScroll = viewport.closest<HTMLElement>("[data-page-scroll]");
  const visibility = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
    near = entries.some(entry => entry.isIntersecting);
    schedule();
  }, { root: pageScroll, rootMargin: "480px 0px" });
  visibility?.observe(viewport);
  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
  resize?.observe(viewport);
  const changes = typeof MutationObserver === "undefined" ? null : new MutationObserver(schedule);
  changes?.observe(viewport, { childList: true, subtree: true });
  viewport.addEventListener("scroll", schedule, { passive: true });
  schedule();

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    viewport.removeEventListener("scroll", schedule);
    visibility?.disconnect();
    resize?.disconnect();
    changes?.disconnect();
    active.forEach(off => off());
    active.clear();
  };
}
