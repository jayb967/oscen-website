/**
 * GPU quality auto-tier for the Cinematic scene.
 *
 * The cinematic brain runs live in the investor dashboard, often on laptops /
 * integrated GPUs. This picks a profile (high / med / low) that scales the
 * neuron point count, device pixel ratio, and post-processing so it never
 * stutters in a pitch. Heuristic + honest: the GPU string is not always
 * available, so we fall back to devicePixelRatio + hardwareConcurrency, and
 * an explicit `?quality=high|med|low` URL param always wins.
 */

const PROFILES = {
    high: { tier: 'high', surfaceCount: 240000, fillTotal: 90000, pixelRatio: 2.0, grade: true,  grain: 0.05, bloom: 0.6 },
    med:  { tier: 'med',  surfaceCount: 130000, fillTotal: 50000, pixelRatio: 1.5, grade: true,  grain: 0.04, bloom: 0.5 },
    low:  { tier: 'low',  surfaceCount: 55000,  fillTotal: 22000, pixelRatio: 1.0, grade: false, grain: 0.0,  bloom: 0.45 },
};

/** Read the unmasked GPU renderer string, or '' if unavailable. */
function gpuString(renderer) {
    try {
        const gl = renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) return (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
    } catch (_) { /* blocked / unavailable */ }
    return '';
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @returns {{tier,surfaceCount,fillTotal,pixelRatio,grade,grain,bloom}} clamped to devicePixelRatio
 */
export function detectQualityTier(renderer) {
    // 1. Explicit override.
    const param = new URLSearchParams(window.location.search).get('quality');
    if (param && PROFILES[param]) return clamp(PROFILES[param]);

    const gpu = gpuString(renderer);
    const cores = navigator.hardwareConcurrency || 4;
    const dpr = window.devicePixelRatio || 1;

    // 2. Software / clearly weak renderers -> low.
    if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return clamp(PROFILES.low);

    // 3. Discrete / strong GPUs -> high.
    //    Apple M-series and desktop NVIDIA/AMD read as capable.
    if (/nvidia|geforce|rtx|gtx|radeon rx|apple m[1-9]/.test(gpu)) return clamp(PROFILES.high);

    // 4. Known integrated families -> med (Intel HD/UHD/Iris, base Apple GPU).
    if (/intel|iris|uhd graphics|hd graphics|mali|adreno|apple gpu/.test(gpu)) return clamp(PROFILES.med);

    // 5. Unknown GPU string: infer from cores + pixel density.
    if (cores >= 8 && dpr >= 2) return clamp(PROFILES.high);
    if (cores >= 6) return clamp(PROFILES.med);
    return clamp(PROFILES.low);
}

function clamp(profile) {
    // Never request a pixel ratio above the device's, and never below 1.
    const dpr = window.devicePixelRatio || 1;
    return { ...profile, pixelRatio: Math.max(1, Math.min(profile.pixelRatio, dpr)) };
}
