#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Event {
    Available,
    Current,
    Error,
    Finished,
    Install,
}

// Sparkle reports these normal outcomes through its error delegate too.
// Values are pinned to Sparkle 2.10.1's SUErrors.h.
pub fn error_event(domain: &str, code: isize) -> Event {
    match (domain, code) {
        ("SUSparkleErrorDomain", 1001) => Event::Current,
        ("SUSparkleErrorDomain", 4007) => Event::Finished,
        _ => Event::Error,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normal_outcomes_are_not_failures() {
        assert_eq!(error_event("SUSparkleErrorDomain", 1001), Event::Current);
        assert_eq!(error_event("SUSparkleErrorDomain", 4007), Event::Finished);
    }
    #[test]
    fn network_and_other_domains_remain_errors() {
        assert_eq!(error_event("SUSparkleErrorDomain", 2001), Event::Error);
        assert_eq!(error_event("NSURLErrorDomain", 1001), Event::Error);
    }
}
