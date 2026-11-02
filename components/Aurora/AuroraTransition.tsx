"use client";

import { useEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { createAuroraTransition } from "@/lib/aurora-transition";

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform mat3 uColorStops;
uniform vec2 uResolution;
uniform float uBlend;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v){
  const vec4 C = vec4(
      0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
      0.5 - vec3(
          dot(x0, x0),
          dot(x12.xy, x12.xy),
          dot(x12.zw, x12.zw)
      ), 
      0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop {
  vec3 color;
  float position;
};

#define COLOR_RAMP(colors, factor, finalColor) {              \\
  int index = 0;                                            \\
  for (int i = 0; i < 2; i++) {                               \\
     ColorStop currentColor = colors[i];                    \\
     bool isInBetween = currentColor.position <= factor;    \\
     index = int(mix(float(index), float(i), float(isInBetween))); \\
  }                                                         \\
  ColorStop currentColor = colors[index];                   \\
  ColorStop nextColor = colors[index + 1];                  \\
  float range = nextColor.position - currentColor.position; \\
  float lerpFactor = (factor - currentColor.position) / range; \\
  finalColor = mix(currentColor.color, nextColor.color, lerpFactor); \\
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  
  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);
  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);

  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;
  
  float midPoint = 0.20;
  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);
  
  vec3 auroraColor = intensity * rampColor;
  
  fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
}
`;

interface AuroraTransitionProps {
  colorStops: string[];
  amplitude?: number;
  blend?: number;
  paused?: boolean;
  time?: number;
  speed?: number;
}

export default function AuroraTransition(props: AuroraTransitionProps) {
    const propsRef = useRef(props);
    useEffect(() => { propsRef.current = props; }, [props]);
    const containerRef = useRef<HTMLDivElement>(null);
    const fallbackRef = useRef<HTMLDivElement>(null);
    const refreshRef = useRef<(() => void) | null>(null);
    const [contextVersion, setContextVersion] = useState(0);
    const [initialGradient] = useState(() => gradient(createAuroraTransition(props.colorStops).value));
    const colorKey = props.colorStops.join(",");

    useEffect(() => {
        const container = containerRef.current;
        const fallback = fallbackRef.current;
        if (!container || !fallback) return;
        const palette = createAuroraTransition(propsRef.current.colorStops);
        let renderer: Renderer | undefined;
        let program: Program | undefined;
        let geometry: Triangle | undefined;
        let mesh: Mesh | undefined;
        let lost = false;
        let frame = 0;
        let previousTime: number | null = null;
        let elapsed = 0;
        let lastDraw = -Infinity;
        let inView = true;
        let disposed = false;
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

        try {
            renderer = new Renderer({
                alpha: true, premultipliedAlpha: true, antialias: false,
                depth: false, stencil: false, dpr: 1, webgl: 2, powerPreference: "low-power",
            });
            const gl = renderer.gl;
            gl.clearColor(0, 0, 0, 0);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            Object.assign(gl.canvas.style, { position: "absolute", inset: "0", backgroundColor: "transparent" });
            geometry = new Triangle(gl);
            if (geometry.attributes.uv) delete geometry.attributes.uv;
            program = new Program(gl, {
                vertex: VERT, fragment: FRAG,
                uniforms: {
                    uTime: { value: 0 }, uAmplitude: { value: propsRef.current.amplitude ?? 0.8 },
                    // Three RGB columns: OGL can upload this reusable buffer
                    // directly, without flattening an array of color vectors.
                    uColorStops: { value: palette.value }, uResolution: { value: [1, 1] },
                    uBlend: { value: propsRef.current.blend ?? 0.4 },
                },
            });
            if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) throw new Error("Aurora shader unavailable");
            mesh = new Mesh(gl, { geometry, program });
            container.appendChild(gl.canvas);
        } catch {
            // Keep the same palette/transition path when WebGL is unavailable.
            program?.remove();
            geometry?.remove();
            renderer = undefined;
            program = undefined;
            geometry = undefined;
        }

        function stop() {
            cancelAnimationFrame(frame);
            frame = 0;
            previousTime = null;
        }
        function canDraw() {
            return !disposed && !document.hidden && inView && !propsRef.current.paused;
        }
        function draw(now: number) {
            const current = propsRef.current;
            const colors = palette.sample(now);
            if (previousTime !== null) elapsed += Math.min(100, now - previousTime) / 1000;
            previousTime = now;
            lastDraw = now;
            if (renderer && program && mesh && !lost) {
                program.uniforms.uTime.value = (current.time ?? elapsed) * (current.speed ?? 1);
                program.uniforms.uAmplitude.value = current.amplitude ?? 0.8;
                program.uniforms.uBlend.value = current.blend ?? 0.4;
                renderer.render({ scene: mesh });
                renderer.gl.canvas.style.opacity = "1";
        fallback!.style.opacity = "0";
            } else {
        fallback!.style.opacity = "0.4";
        fallback!.style.backgroundImage = gradient(colors);
            }
        }
        function needsFrames() {
            return !motion.matches && ((Boolean(renderer) && !lost) || palette.active);
        }
        function tick(now: number) {
            frame = 0;
            if (!canDraw()) { previousTime = null; return; }
            // A soft ambient background does not need a 60/120 Hz GPU draw rate.
            if (now - lastDraw >= 1000 / 30 - 0.5) draw(now);
            if (needsFrames()) frame = requestAnimationFrame(tick);
        }
        function refresh() {
            stop();
            if (!canDraw()) return;
            const now = performance.now();
            palette.target(propsRef.current.colorStops, now, motion.matches);
            draw(now);
            if (needsFrames()) frame = requestAnimationFrame(tick);
        }
        refreshRef.current = refresh;
        function resize() {
            if (renderer && program && !lost) {
                const width = Math.max(1, container!.offsetWidth);
                const height = Math.max(1, container!.offsetHeight);
                renderer.setSize(width, height);
                program.uniforms.uResolution.value = [renderer.gl.canvas.width, renderer.gl.canvas.height];
            }
            refresh();
        }
        function onContextLost(event: Event) {
            event.preventDefault();
            lost = true;
            if (renderer) renderer.gl.canvas.style.opacity = "0";
      fallback!.style.backgroundImage = gradient(palette.value);
      fallback!.style.opacity = "0.4";
      refresh();
        }
        function onContextRestored() { setContextVersion(version => version + 1); }
        renderer?.gl.canvas.addEventListener("webglcontextlost", onContextLost);
        renderer?.gl.canvas.addEventListener("webglcontextrestored", onContextRestored);
        document.addEventListener("visibilitychange", refresh);
        motion.addEventListener("change", refresh);
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
        const intersection = new IntersectionObserver(([entry]) => {
            inView = entry.isIntersecting;
            refresh();
        });
        intersection.observe(container);
        resize();

        return () => {
            disposed = true;
            stop();
            refreshRef.current = null;
            resizeObserver.disconnect();
            intersection.disconnect();
            document.removeEventListener("visibilitychange", refresh);
            motion.removeEventListener("change", refresh);
            renderer?.gl.canvas.removeEventListener("webglcontextlost", onContextLost);
            renderer?.gl.canvas.removeEventListener("webglcontextrestored", onContextRestored);
            renderer?.gl.canvas.remove();
            program?.remove();
            geometry?.remove();
            // Release owned resources without forcing loss of the browser's context.
        };
    }, [contextVersion]);

    useEffect(() => {
        refreshRef.current?.();
    }, [colorKey, props.amplitude, props.blend, props.paused, props.speed, props.time]);

    return <div ref={containerRef} className="relative w-full h-full">
        <div ref={fallbackRef} aria-hidden="true" className="absolute inset-0 opacity-40"
            style={{ backgroundImage: initialGradient }} />
    </div>;
}

function gradient(colors: Float32Array): string {
    const color = (index: number) => `rgb(${Math.round(colors[index * 3] * 255)} ${Math.round(colors[index * 3 + 1] * 255)} ${Math.round(colors[index * 3 + 2] * 255)})`;
    return `radial-gradient(ellipse at 10% 35%, ${color(0)}, transparent 65%), radial-gradient(ellipse at 90% 55%, ${color(1)}, transparent 65%), radial-gradient(ellipse at 50% 0%, ${color(2)}, transparent 60%)`;
}
