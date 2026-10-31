// SPDX-License-Identifier: AGPL-3.0-only
// HDR policy adapted from AIOStreams c358754b0ae4758d034badf8618de6fdb7fa9333,
// packages/desktop/app/src/platform/macos/video.rs. See desktop/THIRD-PARTY.md.

/// PQ luminance at SDR reference white, matching AIOStreams.
pub const REFERENCE_WHITE: f64 = 203.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Video {
    pub primaries: &'static str,
    pub colorspace: &'static str,
}

impl Video {
    /// HLG input is converted by mpv to the same PQ output as HDR10.
    pub fn from_metadata(gamma: Option<&str>, primaries: Option<&str>) -> Option<Self> {
        if !matches!(gamma, Some("pq" | "hlg")) {
            return None;
        }
        let (primaries, colorspace) = match primaries? {
            "bt.2020" => ("bt.2020", "kCGColorSpaceITUR_2100_PQ"),
            "display-p3" => ("display-p3", "kCGColorSpaceDisplayP3_PQ"),
            _ => return None,
        };
        Some(Self {
            primaries,
            colorspace,
        })
    }
}

/// Avoid shader recompilation for brightness fluctuations below 5%.
/// Like AIOStreams, use potential headroom when current headroom reports 1.0.
pub fn target_peak(
    current: f64,
    potential: f64,
    float_surface: bool,
    previous: Option<u32>,
) -> Option<u32> {
    if !float_surface || !potential.is_finite() || potential <= 1.0 {
        return None;
    }
    let headroom = if current.is_finite() && current > 1.0 {
        current
    } else {
        potential
    };
    let peak = (headroom * REFERENCE_WHITE)
        .round()
        .clamp(REFERENCE_WHITE, 10_000.0) as u32;
    Some(match previous {
        Some(old) if u64::from(peak.abs_diff(old)) * 20 < u64::from(old) => old,
        _ => peak,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pq_and_hlg_use_matching_pq_colorspace() {
        for gamma in ["pq", "hlg"] {
            assert_eq!(
                Video::from_metadata(Some(gamma), Some("bt.2020")),
                Some(Video {
                    primaries: "bt.2020",
                    colorspace: "kCGColorSpaceITUR_2100_PQ",
                })
            );
            assert_eq!(
                Video::from_metadata(Some(gamma), Some("display-p3"))
                    .unwrap()
                    .colorspace,
                "kCGColorSpaceDisplayP3_PQ"
            );
        }
        for gamma in [None, Some("bt.1886"), Some("srgb")] {
            assert_eq!(Video::from_metadata(gamma, Some("bt.2020")), None);
        }
        assert_eq!(Video::from_metadata(Some("pq"), None), None);
        assert_eq!(Video::from_metadata(Some("pq"), Some("unknown")), None);
    }

    #[test]
    fn fallback_and_display_brightness_changes() {
        assert_eq!(target_peak(4.0, 8.0, true, None), Some(812));
        assert_eq!(target_peak(1.0, 8.0, true, None), Some(1624));
        assert_eq!(target_peak(4.1, 8.0, true, Some(812)), Some(812));
        assert_eq!(target_peak(2.0, 8.0, true, Some(812)), Some(406));
        assert_eq!(target_peak(1.0, 1.0, true, Some(812)), None);
        assert_eq!(target_peak(4.0, 8.0, false, None), None);
        assert_eq!(target_peak(4.0, f64::NAN, true, None), None);
        assert_eq!(target_peak(4.0, f64::INFINITY, true, None), None);
        assert_eq!(target_peak(f64::NAN, 4.0, true, None), Some(812));
        assert_eq!(target_peak(1000.0, 1000.0, true, None), Some(10_000));
    }
}
