// Small compatibility hooks for the hosted player until the React PR deploys.
(function installPlayerUI(document, send) {
  const selector = '[data-native-player-shell]';
  const decorate = () => {
    const shell = document.querySelector(selector);
    if (!shell) return;
    for (const button of shell.querySelectorAll('button[aria-label="Close player"], button[data-player-close]')) {
      if (!button.hasAttribute('data-player-close')) button.setAttribute('data-player-close', '');
      if (button.getAttribute('aria-label') !== 'Back to browsing') button.setAttribute('aria-label', 'Back to browsing');
      for (const node of button.childNodes) {
        if (node.nodeType === 3 && node.textContent.trim() === 'Go Back') node.textContent = 'Back';
      }
    }
  };
  const observer = new MutationObserver(decorate);
  observer.observe(document, { childList: true, subtree: true });
  decorate();
  return () => observer.disconnect();
})
