package app.navigator.android

class EndpointHaptics {
    private var active = false
    private var zone = 0

    fun begin(value: Float) { active = true; zone = edge(value) }
    fun update(value: Float): Boolean {
        if (!active || !value.isFinite()) return false
        val next = edge(value)
        if (next != 0 && next != zone) { zone = next; return true }
        if (value > .03f && value < .97f) zone = 0
        return false
    }
    fun end() { active = false }
    private fun edge(value: Float) = when {
        value <= .0001f -> -1
        value >= .9999f -> 1
        else -> 0
    }
}
