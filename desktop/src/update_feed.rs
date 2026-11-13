//! Read-only availability hint for our generated Windows appcast, never an installer.
//! WinSparkle still owns the download, signature verification and installation.
#[cfg(any(windows, test))]
use std::collections::BTreeMap;

pub const CHECK_INTERVAL: std::time::Duration = std::time::Duration::from_secs(3600);

pub fn next_probe_delay(started: bool) -> std::time::Duration {
    if started {
        CHECK_INTERVAL
    } else {
        std::time::Duration::from_secs(5)
    }
}

#[cfg(any(windows, test))]
fn version(value: &str) -> Option<[u64; 3]> {
    let parts: Vec<_> = value.split('.').collect();
    if parts.len() != 3
        || parts
            .iter()
            .any(|part| part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit()))
    {
        return None;
    }
    Some([
        parts[0].parse().ok()?,
        parts[1].parse().ok()?,
        parts[2].parse().ok()?,
    ])
}

// Deliberately accept only the enclosure format emitted by windows-update-feed.mjs.
// Fail closed on entities, comments, DTDs, duplicate attributes and unknown versions.
#[cfg(any(windows, test))]
fn attributes(mut text: &str) -> Option<BTreeMap<&str, &str>> {
    let mut fields = BTreeMap::new();
    while !text.trim().is_empty() {
        text = text.trim_start();
        let end =
            text.find(|c: char| !(c.is_ascii_alphanumeric() || matches!(c, ':' | '-' | '_')))?;
        if end == 0 {
            return None;
        }
        let name = &text[..end];
        text = text[end..].trim_start().strip_prefix('=')?.trim_start();
        let quote = text.chars().next()?;
        if quote != '\'' && quote != '"' {
            return None;
        }
        text = &text[1..];
        let end = text.find(quote)?;
        let value = &text[..end];
        if value.contains(['<', '>', '&']) || fields.insert(name, value).is_some() {
            return None;
        }
        text = &text[end + 1..];
        if !text.is_empty() && !text.starts_with(char::is_whitespace) {
            return None;
        }
    }
    Some(fields)
}

#[cfg(any(windows, test))]
pub fn windows_update_available(feed: &str, installed: &str) -> Option<bool> {
    let installed = version(installed)?;
    if feed.len() > 64 * 1024
        || feed.contains("<!")
        || !feed.contains("<rss ")
        || !feed.trim_end().ends_with("</rss>")
        || !feed.contains("xmlns:sparkle=\"http://www.andymatuschak.org/xml-namespaces/sparkle\"")
    {
        return None;
    }
    let mut found = false;
    let mut newer = false;
    for enclosure in feed.split("<enclosure").skip(1) {
        if !enclosure.starts_with(char::is_whitespace) {
            return None;
        }
        let fields = attributes(enclosure.split_once("/>")?.0)?;
        let release = version(fields.get("sparkle:version")?)?;
        if fields.get("sparkle:os") != Some(&"windows") {
            continue;
        }
        let url = fields.get("url")?;
        if !url.starts_with("https://github.com/AyaanZaveri/navigator/releases/download/")
            || !url.ends_with("-windows-x64-setup.exe")
            || fields.get("sparkle:edSignature")?.is_empty()
        {
            return None;
        }
        found = true;
        newer |= release > installed;
    }
    found.then_some(newer)
}

#[cfg(test)]
mod tests {
    use super::*;
    const FEED: &str = include_str!("../../updates/windows.xml");
    #[test]
    fn published_feed_compares_numeric_release_versions() {
        assert_eq!(CHECK_INTERVAL.as_secs(), 3600);
        assert_eq!(next_probe_delay(false).as_secs(), 5);
        assert_eq!(next_probe_delay(true), CHECK_INTERVAL);
        assert_eq!(windows_update_available(FEED, "0.0.0"), Some(true));
        assert_eq!(
            windows_update_available(FEED, env!("CARGO_PKG_VERSION")),
            Some(false)
        );
        assert_eq!(windows_update_available(FEED, "999.0.0"), Some(false));
        assert!(version("0.10.0") > version("0.9.9"));
        assert!(version("0.5.10") > version("0.5.9"));
    }
    #[test]
    fn unsupported_or_untrusted_feed_shapes_are_not_updates() {
        for changed in [
            FEED.replace("<rss ", "<other "),
            FEED.replace("sparkle:version=", "other:version="),
            FEED.replace("https://github.com/AyaanZaveri/", "https://evil.example/"),
            FEED.replace("-windows-x64-setup.exe", "-windows-arm64-setup.exe"),
            FEED.replace("<enclosure ", "<enclosure url=\"duplicate\" "),
            format!("<!-- <enclosure sparkle:version=\"99.0.0\"/> -->{FEED}"),
            "x".repeat(65537),
        ] {
            assert_eq!(windows_update_available(&changed, "0.0.0"), None);
        }
        for invalid in [
            "",
            "1.2",
            "1.2.3-beta",
            "1.2.3.4",
            "-1.2.3",
            "1.2.9999999999999999999999999",
        ] {
            assert_eq!(windows_update_available(FEED, invalid), None);
        }
    }
}
