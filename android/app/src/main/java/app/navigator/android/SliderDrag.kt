package app.navigator.android

class SliderDrag {
    private var value = 0f
    private var lastY = 0f
    private var span = 1f
    private var minimum = 0f

    fun begin(value: Float, y: Float, span: Float, minimum: Float) {
        this.minimum = minimum
        this.value = value.coerceIn(minimum, 1f)
        lastY = y
        this.span = span.coerceAtLeast(1f)
    }
    fun move(y: Float): Float {
        value = (value + (lastY - y) / span).coerceIn(minimum, 1f)
        lastY = y
        return value
    }
}
