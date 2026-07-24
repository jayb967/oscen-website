/**
 * Cinematic color-grade post pass.
 *
 * A single screen-space ShaderPass appended after bloom. Because the cinematic
 * scene is almost entirely additive/transparent (neuron point cloud + glass
 * shell with depthWrite off), depth-buffer effects (SSAO / DOF / depth contact
 * shadows) have nothing to bite on and would fight the look. A color grade,
 * by contrast, works on any scene and delivers the "filmic" finish:
 *   - subtle chromatic aberration toward the edges
 *   - vignette
 *   - animated film grain
 *   - gentle contrast + saturation lift
 *
 * All strengths are uniforms so they can be dialed or disabled per quality tier.
 */
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const GRADE_SHADER = {
    uniforms: {
        tDiffuse:    { value: null },
        uTime:       { value: 0 },
        uVignette:   { value: 1.1 },   // strength
        uGrain:      { value: 0.05 },  // amount
        uAberration: { value: 0.0016 },// max channel offset at the edge
        uContrast:   { value: 1.06 },
        uSaturation: { value: 1.08 },
    },
    vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform float uVignette;
        uniform float uGrain;
        uniform float uAberration;
        uniform float uContrast;
        uniform float uSaturation;
        varying vec2 vUv;

        float rand(vec2 co) {
            return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            vec2 center = vUv - 0.5;
            float dist = length(center);

            // Chromatic aberration: split channels radially, stronger at edges.
            vec2 dir = center * dist;
            vec3 col;
            col.r = texture2D(tDiffuse, vUv - dir * uAberration).r;
            col.g = texture2D(tDiffuse, vUv).g;
            col.b = texture2D(tDiffuse, vUv + dir * uAberration).b;

            // Contrast around mid grey.
            col = (col - 0.5) * uContrast + 0.5;

            // Saturation.
            float luma = dot(col, vec3(0.299, 0.587, 0.114));
            col = mix(vec3(luma), col, uSaturation);

            // Vignette.
            float vig = smoothstep(0.9, 0.25, dist * uVignette);
            col *= mix(0.72, 1.0, vig);

            // Animated film grain (subtle, keeps the render from looking sterile).
            float g = rand(vUv + fract(uTime));
            col += (g - 0.5) * uGrain;

            gl_FragColor = vec4(col, 1.0);
        }
    `,
};

export function createGradePass() {
    return new ShaderPass(GRADE_SHADER);
}
