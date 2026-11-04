import { MMCQ } from "@vibrant/quantizer-mmcq";
import { selectHomeColors } from "./home-palette-colors";

// Use raw Vibrant quantizer populations, rather than the generated Vibrant
// categories. Only this worker performs color quantization for the home screen.
self.onmessage = async (event: MessageEvent<{ id: number; pixels: Uint8ClampedArray }>) => {
    const { id, pixels } = event.data;
    try {
        for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] < 125) pixels[i + 3] = 0;
        }
        const swatches = MMCQ(pixels, { colorCount: 64 });
        const colors = selectHomeColors(swatches);
        self.postMessage({ id, colors });
    } catch {
        self.postMessage({ id, colors: null });
    }
};
