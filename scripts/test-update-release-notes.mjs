import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { updateReleaseNotesHtml } from "./update-release-notes.mjs";

// Test the feed payload, not the app's CSS. These are separate native WebViews.
for (const platform of ["windows", "macos"]) {
    const feed = readFileSync(`updates/${platform}.xml`, "utf8");
    const html = feed.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1];
    assert.equal(html, updateReleaseNotesHtml, `${platform}: current feed uses the shared HTML`);
}
assert.match(updateReleaseNotesHtml, /<meta name="color-scheme" content="light dark">/);
assert.doesNotMatch(updateReleaseNotesHtml, /<script|https?:\/\//, "Notes must work offline without script or remote styles");

const css = postcss.parse(updateReleaseNotesHtml.match(/<style>([\s\S]*?)<\/style>/)[1]);
function colors(dark, modern) {
    const result = {};
    // IE ignores prefers-color-scheme. Modern WebViews apply the dark override.
    css.walkRules(rule => {
        if (rule.selector !== "html, body") return;
        if (rule.parent.type === "atrule") {
            assert.equal(rule.parent.name, "media");
            assert.equal(rule.parent.params, "(prefers-color-scheme: dark)");
            if (!modern || !dark) return;
        }
        rule.walkDecls(decl => { result[decl.prop] = decl.value; });
    });
    return result;
}
function luminance(hex) {
    const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
for (const [dark, modern] of [[false, true], [true, true], [false, false], [true, false]]) {
    const palette = colors(dark, modern);
    assert.deepEqual(palette, dark && modern
        ? { "background-color": "#171717", color: "#f5f5f5" }
        : { "background-color": "#ffffff", color: "#171717" });
    const values = [luminance(palette.color), luminance(palette["background-color"])];
    assert.ok((Math.max(...values) + 0.05) / (Math.min(...values) + 0.05) >= 7, "Release notes retain high contrast in every renderer/theme");
}
console.log("PASS: current Windows/macOS notes match shared HTML; light, dark and legacy fallback palettes retain readable contrast without remote assets.");
