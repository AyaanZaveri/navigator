package app.navigator.android;

/** Back owns UI dismissal before route navigation; fullscreen is not a separate destination. */
final class BackPolicy {
    enum Action { DISMISS_OVERLAY, CLOSE_PLAYER, GO_BACK, SYSTEM, LEAVE_ERROR }

    static Action action(boolean error, boolean overlay, boolean player, boolean history) {
        if (error) return Action.LEAVE_ERROR;
        if (overlay) return Action.DISMISS_OVERLAY;
        if (player) return Action.CLOSE_PLAYER;
        if (history) return Action.GO_BACK;
        return Action.SYSTEM;
    }
}
