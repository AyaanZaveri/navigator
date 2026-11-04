import { MMCQ } from "@vibrant/quantizer-mmcq";
import { DefaultGenerator } from "@vibrant/generator-default";
import { selectAuroraColors } from "./aurora-palette";

// Use Vibrant's quantizer/generator without its browser ImageClass or global
// pipeline. Only this worker performs color quantization for the home screen.
self.onmessage = async (event: MessageEvent<{ id: number; pixels: Uint8ClampedArray }>) => {
    const { id, pixels } = event.data;
    try {
        for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] < 125 || (pixels[i] > 250 && pixels[i + 1] > 250 && pixels[i + 2] > 250)) pixels[i + 3] = 0;
        }
        const swatches = MMCQ(pixels, { colorCount: 64 });
        const palette = await DefaultGenerator(swatches);
        const colors = selectAuroraColors(Object.values(palette).filter(swatch => swatch != null));
        self.postMessage({ id, colors });
    } catch {
        self.postMessage({ id, colors: null });
    }
};
