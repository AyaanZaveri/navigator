//! Coalesce render notifications and defer future frames without sleeping on UI.
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

#[derive(Default)]
pub struct UpdateGate(AtomicBool);
impl UpdateGate {
    pub fn queue(&self) -> bool { !self.0.swap(true, Ordering::AcqRel) }
    pub fn begin(&self) { self.0.store(false, Ordering::Release); }
}

#[derive(Debug, PartialEq)]
pub enum Draw {
    Now,
    Pending,
    Later { ticket: u64, wait: Duration },
}
#[derive(Default)]
pub struct FrameSchedule {
    ticket: u64,
    deadline: Option<Instant>,
}
impl FrameSchedule {
    pub fn request(&mut self, now: Instant, wait: Option<Duration>) -> Draw {
        let wait = wait.unwrap_or_default();
        if wait <= Duration::from_millis(1) {
            self.cancel();
            return Draw::Now;
        }
        // Long timestamp gaps are rechecked rather than producing an unbounded
        // dispatch timer. mpv remains the owner of the actual presentation time.
        let wait = wait.min(Duration::from_secs(1));
        let deadline = now + wait;
        if self.deadline.is_some_and(|old| old <= deadline + Duration::from_millis(1)) { return Draw::Pending; }
        self.ticket = self.ticket.wrapping_add(1);
        self.deadline = Some(deadline);
        Draw::Later { ticket: self.ticket, wait }
    }
    pub fn take(&mut self, ticket: u64) -> bool {
        if self.ticket != ticket || self.deadline.is_none() { return false; }
        self.deadline = None;
        true
    }
    pub fn cancel(&mut self) {
        self.ticket = self.ticket.wrapping_add(1);
        self.deadline = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn burst_notifications_queue_one_ui_task() {
        let gate = UpdateGate::default();
        assert!(gate.queue());
        for _ in 0..1000 { assert!(!gate.queue()); }
        gate.begin();
        assert!(gate.queue(), "An update during rendering must schedule the following frame");
    }
    #[test]
    fn deadlines_coalesce_preempt_and_cancel() {
        let now = Instant::now(); let mut frames = FrameSchedule::default();
        let Draw::Later { ticket: first, wait } = frames.request(now, Some(Duration::from_millis(20))) else { panic!() };
        assert_eq!(wait, Duration::from_millis(20));
        assert_eq!(frames.request(now, Some(Duration::from_millis(21))), Draw::Pending);
        let Draw::Later { ticket: sooner, .. } = frames.request(now, Some(Duration::from_millis(5))) else { panic!() };
        assert!(!frames.take(first)); assert!(frames.take(sooner)); assert!(!frames.take(sooner));
        let Draw::Later { ticket, wait } = frames.request(now, Some(Duration::from_secs(100))) else { panic!() };
        assert_eq!(wait, Duration::from_secs(1));
        assert_eq!(frames.request(now, None), Draw::Now);
        assert!(!frames.take(ticket), "Redraw/stop must invalidate an older timer");
    }
}
