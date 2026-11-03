package app.navigator.android

object BackPolicy {
    enum class Action { DISMISS_OVERLAY, CLOSE_PLAYER, GO_BACK, SYSTEM, LEAVE_ERROR }

    @JvmStatic fun action(error: Boolean, overlay: Boolean, player: Boolean, history: Boolean): Action = when {
        error -> Action.LEAVE_ERROR
        overlay -> Action.DISMISS_OVERLAY
        player -> Action.CLOSE_PLAYER
        history -> Action.GO_BACK
        else -> Action.SYSTEM
    }
}
