// Inline HTML works in WinSparkle's Edge/IE views and Sparkle's WKWebView.
// Native updater views follow the OS appearance, independently of the web app.
// Set both colors: an unstyled fragment can inherit dark canvas + black text.
export const updateReleaseNotesHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light dark">
<style>
:root { color-scheme: light dark; }
html, body { background-color: #ffffff; color: #171717; }
body { margin: 16px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 14px; line-height: 1.5; }
p { margin: 0; }
@media (prefers-color-scheme: dark) {
  html, body { background-color: #171717; color: #f5f5f5; }
}
</style>
</head>
<body><p>Update Navigator, then reopen it with your existing sign-in and settings.</p></body>
</html>`;

// Escape the HTML as XML text rather than CDATA. Older Windows availability
// probes reject declarations (<!), including CDATA, before WinSparkle opens.
export const updateReleaseNotesXml = updateReleaseNotesHtml.replace(/[<>&"']/g,
    char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
