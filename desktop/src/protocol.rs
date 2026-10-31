use serde::Deserialize;
use std::collections::BTreeMap;
use url::Url;

pub const PROTOCOL: u32 = 1;
pub const MAX_MESSAGE_BYTES: usize = 64 * 1024;

/// Deliberately exposes playback operations, never arbitrary mpv commands or paths.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Command {
    Load {
        session: String,
        url: String,
        #[serde(default)]
        headers: BTreeMap<String, String>,
    },
    Play {
        session: String,
    },
    Pause {
        session: String,
    },
    Seek {
        session: String,
        position: f64,
    },
    Volume {
        session: String,
        volume: f64,
    },
    Muted {
        session: String,
        muted: bool,
    },
    Rate {
        session: String,
        rate: f64,
    },
    Track {
        session: String,
        kind: TrackKind,
        id: String,
    },
    Stop {
        session: String,
    },
    Fullscreen {
        value: bool,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrackKind {
    Audio,
    Subtitle,
}

pub fn parse(text: &str) -> Result<Command, String> {
    if text.len() > MAX_MESSAGE_BYTES {
        return Err("Message is too large".into());
    }
    let command: Command = serde_json::from_str(text).map_err(|e| e.to_string())?;
    match &command {
        Command::Load {
            session,
            url,
            headers,
        } => {
            if session.is_empty() || session.len() > 128 {
                return Err("Invalid playback session".into());
            }
            media_url(url)?;
            if headers.len() > 32
                || headers.iter().any(|(name, value)| {
                    name.is_empty()
                        || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
                        || value.contains(['\r', '\n', '\0'])
                        || value.len() > 8192
                })
            {
                return Err("Invalid request headers".into());
            }
        }
        Command::Seek { position, .. } if !position.is_finite() || *position < 0.0 => {
            return Err("Invalid seek position".into());
        }
        Command::Volume { volume, .. } if !volume.is_finite() || !(0.0..=1.0).contains(volume) => {
            return Err("Volume must be between 0 and 1".into());
        }
        Command::Rate { rate, .. } if !rate.is_finite() || !(0.25..=4.0).contains(rate) => {
            return Err("Playback speed must be between 0.25 and 4".into());
        }
        Command::Track { id, .. } if id != "no" && id.parse::<u32>().is_err() => {
            return Err("Invalid track id".into());
        }
        _ => {}
    }
    Ok(command)
}

pub fn media_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|e| e.to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() || value.contains('\0')
    {
        return Err("Playback accepts HTTP and HTTPS streams only".into());
    }
    Ok(url)
}

pub fn origin(value: &str) -> Option<String> {
    let url = Url::parse(value).ok()?;
    matches!(url.scheme(), "http" | "https").then(|| url.origin().ascii_serialization())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn playback_boundary() {
        for url in [
            "file:///etc/passwd",
            "edl://x",
            "av://x",
            "/tmp/video",
            "https://example.com/\0x",
        ] {
            assert!(media_url(url).is_err());
        }
        assert!(parse(r#"{"type":"load","session":"one","url":"https://example.com/video.mkv","headers":{"Referer":"https://example.com"}}"#).is_ok());
        assert!(parse(r#"{"type":"load","session":"one","url":"https://example.com","headers":{"X-Test":"x\r\nInjected: x"}}"#).is_err());
        assert!(parse(r#"{"type":"seek","session":"one","position":-1}"#).is_err());
        assert!(parse(r#"{"type":"volume","session":"one","volume":2}"#).is_err());
        assert!(parse(r#"{"type":"command","args":["run","sh"]}"#).is_err());
        assert!(parse(r#"{"type":"play","session":"one","extra":"ignored?"}"#).is_err());
        assert_ne!(
            origin("http://localhost:3000"),
            origin("http://localhost:3001")
        );
    }
}
