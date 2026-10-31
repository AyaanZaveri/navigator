// Compatibility with the hosted UI; layout updates are bounded to actual size
// changes and player mount/unmount, never playback's progress text updates.
(function installPlayerUI(document, window, send) {
  let controls, seek, shell, visibility, last = '';
  const reportVisibility = () => {
    const player = shell?.querySelector('[data-slot="media-player"]');
    const visible = !player || (player.hasAttribute('data-touch-controls')
      ? player.hasAttribute('data-controls-visible') : player.getAttribute('data-android-controls') !== 'hidden');
    if (visible !== visibility) { visibility = visible; send({ type: 'player-controls', visible }); }
  };
  const mark = (node, name) => { if (node && !node.hasAttribute(name)) node.setAttribute(name, ''); };
  const report = () => {
    if (!controls) return;
    const rect = controls.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const values = [rect.top, rect.bottom, window.innerWidth, window.innerHeight].map(value => Math.round(value * 10) / 10);
    const track = seek?.getBoundingClientRect();
    const seekBounds = track?.width && track?.height
      ? Object.fromEntries(['left', 'top', 'right', 'bottom'].map(name => [name, Math.round(track[name] * 10) / 10])) : undefined;
    const key = values.join(',') + ',' + JSON.stringify(seekBounds);
    if (key === last) return;
    last = key;
    send({ type: 'player-layout', top: values[0], bottom: values[1], viewportWidth: values[2], viewportHeight: values[3], seek: seekBounds });
  };
  const resize = new ResizeObserver(report);
  const decorate = () => {
    shell = document.querySelector('[data-native-player-shell]');
    reportVisibility();
    const next = shell?.querySelector('[data-slot="media-player-controls"]');
    const nextSeek = next?.querySelector('[data-slot="media-player-seek"]');
    if (next !== controls || nextSeek !== seek) {
      resize.disconnect(); controls = next; seek = nextSeek; last = '';
      if (controls) resize.observe(controls);
      if (seek) resize.observe(seek);
    }
    if (!shell) return;
    for (const button of shell.querySelectorAll('button[aria-label="Close player"], button[data-player-close]')) {
      mark(button, 'data-player-close');
      if (button.getAttribute('aria-label') !== 'Back to browsing') button.setAttribute('aria-label', 'Back to browsing');
      for (const node of button.childNodes) {
        if (node.nodeType === 3 && node.textContent.trim() === 'Go Back') node.textContent = 'Back';
      }
    }
    for (const heading of shell.querySelectorAll('h2')) {
      mark(heading, 'data-player-title');
      const loading = heading.closest('[class~="bottom-8"][class~="left-8"][class~="right-8"]');
      if (loading) {
        mark(loading, 'data-player-loading-copy');
        const series = heading.parentElement.nextElementSibling;
        if (series?.tagName === 'P') mark(series, 'data-player-loading-series');
      }
    }
    const title = controls?.querySelector('h2');
    if (title) {
      mark(title, 'data-player-title'); mark(title.parentElement, 'data-player-heading-row');
      for (const sibling of title.parentElement.children) if (sibling !== title) mark(sibling, 'data-player-end-time');
      mark(title.parentElement.nextElementSibling, 'data-player-meta');
    }
    const toolbar = controls?.lastElementChild;
    if (toolbar?.querySelector('button')) mark(toolbar, 'data-player-toolbar');
    report();
  };
  const observer = new MutationObserver((records = []) => {
    if (records.some(record => record.type === 'attributes')) reportVisibility();
    if (!records.length || records.some(record => record.type !== 'attributes' && [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1))) decorate();
  });
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-android-controls', 'data-controls-visible'] });
  window.addEventListener('resize', report, { passive: true });
  decorate();
  return () => { observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', report); };
})
