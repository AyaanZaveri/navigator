import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

export const GRADIENT_ANGLES = {
    top: 0,
    right: 90,
    bottom: 180,
    left: 270,
};

export type ProgressiveBlurProps = {
  direction?: keyof typeof GRADIENT_ANGLES;
  blurLayers?: number;
  className?: string;
  blurIntensity?: number;
} & HTMLAttributes<HTMLDivElement>;

export function ProgressiveBlur({
    direction = 'bottom',
    blurLayers = 8,
    className,
    blurIntensity = 0.25,
    ...props
}: ProgressiveBlurProps) {
    const layers = Number.isFinite(blurLayers) ? Math.min(12, Math.max(Math.round(blurLayers), 2)) : 8;
    const intensity = Number.isFinite(blurIntensity) ? Math.max(0, blurIntensity) : 0.25;
    const segmentSize = 1 / (layers + 1);

    return (
        <div {...props} className={cn('pointer-events-none relative', className)}>
            {/* Index zero is an identity filter. Keep the remaining indices/masks
          unchanged so removing it does not shift or strengthen the ramp. */}
            {Array.from({ length: intensity > 0 ? layers - 1 : 0 }, (_, offset) => {
                const index = offset + 1;
                const angle = GRADIENT_ANGLES[direction];
                const gradientStops = [
                    index * segmentSize,
                    (index + 1) * segmentSize,
                    (index + 2) * segmentSize,
                    (index + 3) * segmentSize,
                ].map(
                    (pos, posIndex) =>
                        `rgba(255, 255, 255, ${posIndex === 1 || posIndex === 2 ? 1 : 0}) ${pos * 100}%`
                );

                const gradient = `linear-gradient(${angle}deg, ${gradientStops.join(
                    ', '
                )})`;

                return (
                    <div
                        key={index}
                        data-progressive-blur-layer=""
                        className='pointer-events-none absolute inset-0 rounded-[inherit]'
                        style={{
                            maskImage: gradient,
                            WebkitMaskImage: gradient,
                            backdropFilter: `blur(${index * intensity}px)`,
                            WebkitBackdropFilter: `blur(${index * intensity}px)`,
                        }}
                    />
                );
            })}
        </div>
    );
}
