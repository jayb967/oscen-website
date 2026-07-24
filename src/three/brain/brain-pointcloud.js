/**
 * GPU neuron point cloud for the Cinematic scene.
 *
 * Replaces the classic ~15k instanced spheres with a single THREE.Points cloud
 * of a few hundred thousand soft sprites, so the brain reads as "a million
 * neurons" instead of sparse dust.
 *
 * Sampling: every point is derived from the actual GLB brain surface (area-
 * weighted barycentric) and then pushed INWARD along the surface normal by a
 * random depth. This fills the real brain VOLUME -- following the cortex into
 * both hemispheres -- so the neurons "stick" to the correct parts of the mesh
 * instead of collapsing onto the central sagittal plane (the region centers all
 * sit on the midline, which is why the earlier region-fill looked like a flat
 * curtain when rotated). Points near the surface stay brightest; deeper points
 * form a dim volumetric haze.
 *
 * Each point is assigned to the nearest region center, so per-region firing
 * rates light up the correct cortical areas (bilaterally) via a uniform array.
 * Firing data is read from BrainRegions.regionData (smoothed by the base scene).
 */
import * as THREE from 'three';
import { REGIONS, REGION_POSITIONS } from './data-bridge.js';

const NUM_REGIONS = REGIONS.length;

// How far (world units) neurons extend inward from the cortical surface, and
// how strongly the population biases toward the surface (higher = more surface).
const DEPTH_MAX = 2.7;
const DEPTH_BIAS = 1.7;

// ── Shaders ──────────────────────────────────────────────────────────────
const VERT = /* glsl */ `
    attribute vec3 aColor;
    attribute float aRegion;
    attribute float aSeed;
    attribute float aWeight;   // 1 at surface -> lower with depth

    uniform float uRates[${NUM_REGIONS}];
    uniform float uPulse[${NUM_REGIONS}];
    uniform float uTime;
    uniform float uSize;
    uniform float uPixelRatio;

    varying vec3 vColor;
    varying float vIntensity;
    varying float vDepth;
    varying float vWeight;

    void main() {
        // Direct uniform-array indexing: dynamic indexing is spec-legal in
        // VERTEX shaders even under GLSL ES 1.00 (the constant-index rule
        // only binds fragment shaders), and this runs per point per frame --
        // the old defensive loop cost NUM_REGIONS iterations x 330k points.
        int ri = int(aRegion + 0.5);
        float rate = uRates[ri];
        float pulse = uPulse[ri];

        float intensity = clamp(rate + pulse * 0.5, 0.0, 1.4);
        vIntensity = intensity;
        vColor = aColor;
        vWeight = aWeight;

        // Gentle per-neuron twinkle so the field feels alive even at rest.
        float tw = 0.85 + 0.15 * sin(uTime * 2.0 + aSeed * 6.2831);

        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        // Size: base + firing swell, with perspective (depth-cued) attenuation.
        float size = uSize * (0.55 + intensity * 1.7) * tw * mix(0.7, 1.0, aWeight);
        gl_PointSize = size * uPixelRatio * (12.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
    }
`;

const FRAG = /* glsl */ `
    precision mediump float;
    uniform vec3 uTint;
    uniform float uBright;
    uniform float uAlpha;

    varying vec3 vColor;
    varying float vIntensity;
    varying float vDepth;
    varying float vWeight;

    void main() {
        // Soft round sprite.
        vec2 uv = gl_PointCoord - 0.5;
        float d = dot(uv, uv);
        if (d > 0.25) discard;
        float falloff = exp(-d * 7.0);

        // Depth cueing: nearer points read brighter, far points recede.
        float depthCue = clamp(1.0 - (vDepth - 8.0) / 26.0, 0.35, 1.0);

        vec3 col = vColor * (uBright + vIntensity * 0.95) + uTint * vIntensity;
        float alpha = falloff * (uAlpha + vIntensity * 0.42) * depthCue * vWeight;
        gl_FragColor = vec4(col, alpha);
    }
`;

export class BrainPointCloud {
    /**
     * @param {THREE.Scene} scene
     * @param {Object} opts { surfaceCount, fillTotal, pixelRatio }
     *   surfaceCount + fillTotal are summed into the total volumetric point count
     *   (kept as two knobs so the quality tiers don't need reworking).
     */
    constructor(scene, opts = {}) {
        this.scene = scene;
        this.count = (opts.surfaceCount ?? 240000) + (opts.fillTotal ?? 90000);
        this.pixelRatio = opts.pixelRatio ?? Math.min(window.devicePixelRatio, 2);
        this.points = null;
        this.material = null;
        this._uRates = new Float32Array(NUM_REGIONS);
        this._uPulse = new Float32Array(NUM_REGIONS);
        this.time = 0;

        this._colors = REGIONS.map((r) => new THREE.Color(r.color[0], r.color[1], r.color[2]));

        // Anchor list for neuron->region assignment: parallel arrays of
        // (world position, region index). Cinematic passes anatomical anchors
        // (id -> Vector3 or [L,R] Vector3s) registered on the GLB mesh so a
        // firing region lights the correct cortical area in BOTH hemispheres.
        // Fallback (no centers) reuses the midline REGION_POSITIONS schematic.
        this._anchors = [];        // THREE.Vector3[]
        this._anchorRegion = [];   // int[] parallel to _anchors
        const centers = opts.centers || null;
        REGIONS.forEach((r, ri) => {
            const entry = centers ? centers[r.id] : null;
            let pts;
            if (entry && Array.isArray(entry.cloud)) pts = entry.cloud;
            else if (Array.isArray(entry)) pts = entry;
            else if (entry && entry.isVector3) pts = [entry];
            else {
                const p = REGION_POSITIONS[r.id];
                pts = [new THREE.Vector3(p[0], p[1], p[2])];
            }
            for (const p of pts) { this._anchors.push(p); this._anchorRegion.push(ri); }
        });
    }

    /** Build the cloud from the loaded GLB brain mesh. */
    build(mesh) {
        const v = this._sampleVolume(mesh, this.count);

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(v.positions, 3));
        geo.setAttribute('aColor', new THREE.BufferAttribute(v.colors, 3));
        geo.setAttribute('aRegion', new THREE.BufferAttribute(v.regions, 1));
        geo.setAttribute('aSeed', new THREE.BufferAttribute(v.seeds, 1));
        geo.setAttribute('aWeight', new THREE.BufferAttribute(v.weights, 1));
        geo.computeBoundingSphere();

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uRates: { value: this._uRates },
                uPulse: { value: this._uPulse },
                uTime: { value: 0 },
                uSize: { value: 1.5 },
                uPixelRatio: { value: this.pixelRatio },
                uTint: { value: new THREE.Color(0.10, 0.06, 0.0) },
                // Rebalanced up from pass-3's blowout-panic lows (0.078 / 0.033)
                // now that the synapse pulses are bilateral (activity no longer
                // piles onto one hemisphere) and the bloom guardrails hold the
                // core (threshold 0.92, strength cap 0.2). Keeps the bilateral
                // neuron field readable alongside the bilateral pulses without
                // blowing the core to white at a zoomed-in framing.
                uBright: { value: 0.14 },
                uAlpha: { value: 0.072 },
            },
            vertexShader: VERT,
            fragmentShader: FRAG,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            // No depth test: in the reveal the humanoid's head (which DOES
            // write depth) would otherwise z-cull every neuron behind the
            // face -- the brain must glow THROUGH the skull. In the plain
            // brain scenes nothing else writes depth, so this changes nothing.
            depthTest: false,
        });

        this.points = new THREE.Points(geo, this.material);
        this.points.frustumCulled = false;
        // Draw the additive neuron glow AFTER the transmissive glass shell.
        // The shell's transmission pass only samples the opaque backdrop (not
        // transparent additive points), so if the glass drew last it would
        // overwrite every neuron behind its front face -- which read as a whole
        // hemisphere going dark. A higher renderOrder makes the points composite
        // over the glass, so neurons glow through from anywhere in the volume.
        this.points.renderOrder = 2;
        this.scene.add(this.points);
        return this.count;
    }

    /**
     * Sample `count` points from the mesh surface, each pushed inward along the
     * normal by a surface-biased random depth -> a volumetric cortical band that
     * follows the real brain into both hemispheres. All in world (scene) space.
     */
    _sampleVolume(mesh, count) {
        mesh.updateWorldMatrix(true, false);
        const world = mesh.matrixWorld;
        const normalMat = new THREE.Matrix3().getNormalMatrix(world);

        const geo = mesh.geometry;
        const pos = geo.getAttribute('position');
        const idx = geo.getIndex();
        const nrm = geo.getAttribute('normal');
        const triCount = idx ? idx.count / 3 : pos.count / 3;

        // Cumulative triangle areas for weighted picking.
        const cum = new Float32Array(triCount);
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        const ab = new THREE.Vector3(), ac = new THREE.Vector3();
        const triIdx = (t) => {
            const i0 = idx ? idx.getX(t * 3) : t * 3;
            const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
            const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
            return [i0, i1, i2];
        };
        let acc = 0;
        for (let t = 0; t < triCount; t++) {
            const [i0, i1, i2] = triIdx(t);
            a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
            ab.subVectors(b, a); ac.subVectors(c, a);
            acc += 0.5 * ab.cross(ac).length();
            cum[t] = acc;
        }
        const totalArea = acc || 1;

        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const regions = new Float32Array(count);
        const seeds = new Float32Array(count);
        const weights = new Float32Array(count);

        const p = new THREE.Vector3(), n = new THREE.Vector3();
        const na = new THREE.Vector3(), nb = new THREE.Vector3(), nc = new THREE.Vector3();
        for (let k = 0; k < count; k++) {
            const target = Math.random() * totalArea;
            let lo = 0, hi = triCount - 1;
            while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < target) lo = m + 1; else hi = m; }
            const [i0, i1, i2] = triIdx(lo);
            a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);

            let u = Math.random(), vv = Math.random();
            if (u + vv > 1) { u = 1 - u; vv = 1 - vv; }
            p.copy(a).addScaledVector(ab.subVectors(b, a), u).addScaledVector(ac.subVectors(c, a), vv);

            na.fromBufferAttribute(nrm, i0); nb.fromBufferAttribute(nrm, i1); nc.fromBufferAttribute(nrm, i2);
            n.copy(na).multiplyScalar(1 - u - vv).addScaledVector(nb, u).addScaledVector(nc, vv);

            // To world space, then push inward along the world-space normal.
            p.applyMatrix4(world);
            n.applyMatrix3(normalMat).normalize();
            const depthN = Math.pow(Math.random(), DEPTH_BIAS);   // 0 at surface -> 1 deep
            const depth = depthN * DEPTH_MAX;
            p.addScaledVector(n, -depth);
            // A little tangential jitter so inner shells don't look layered.
            p.x += (Math.random() - 0.5) * 0.12;
            p.y += (Math.random() - 0.5) * 0.12;
            p.z += (Math.random() - 0.5) * 0.12;

            positions[k * 3] = p.x; positions[k * 3 + 1] = p.y; positions[k * 3 + 2] = p.z;

            const ri = this._nearestRegion(p);
            const col = this._colors[ri];
            colors[k * 3] = col.r; colors[k * 3 + 1] = col.g; colors[k * 3 + 2] = col.b;
            regions[k] = ri;
            seeds[k] = Math.random();
            weights[k] = 1.0 - depthN * 0.55;   // surface brightest, deep dimmer
        }
        return { positions, colors, regions, seeds, weights };
    }

    _nearestRegion(p) {
        let best = 0, bestD = Infinity;
        for (let i = 0; i < this._anchors.length; i++) {
            const d = p.distanceToSquared(this._anchors[i]);
            if (d < bestD) { bestD = d; best = this._anchorRegion[i]; }
        }
        return best;
    }

    /** Feed per-region firing data (from BrainRegions.regionData). */
    setFiringData(regionData) {
        for (let i = 0; i < REGIONS.length; i++) {
            const d = regionData[REGIONS[i].id];
            if (!d) continue;
            this._uRates[i] = Math.min(1.4, Math.sqrt(Math.max(0, d.currentRate) * 5.0));
            this._uPulse[i] = d.pulseIntensity || 0;
        }
    }

    /** Optional dopamine warmth tint (mirrors the pulse warm shift). */
    setNeuromodulation(nm) {
        if (!this.material || !nm) return;
        const daWarm = Math.max(0, (nm.da || 1.2) - 1.0);
        this.material.uniforms.uTint.value.setRGB(daWarm * 0.12, daWarm * 0.06, 0.0);
    }

    update(dt) {
        this.time += dt;
        if (this.material) this.material.uniforms.uTime.value = this.time;
    }

    /**
     * Scale the sprite size with the brain group's world scale. Point
     * POSITIONS inherit the parent transform, but gl_PointSize does not --
     * without this, shrinking the brain (the reveal) leaves every firing
     * point at full screen-space size and the clusters read as giant blobs.
     *
     * Sub-linear exponent: strictly linear sprite size makes the cloud's
     * luminance fall off with scale^2, and the in-skull brain goes almost
     * invisible. k^0.6 keeps k=1 exact (hero untouched) while giving the
     * 0.038-scale reveal brain ~5x the linear sprite footprint -- glowing
     * mass, still well inside the skull silhouette.
     */
    setSizeScale(k) {
        this._sizeScale = k;
        if (this.material) this.material.uniforms.uSize.value = 1.5 * Math.pow(k, 0.6);
    }

    setVisible(v) { if (this.points) this.points.visible = v; }

    dispose() {
        if (this.points) {
            this.scene.remove(this.points);
            this.points.geometry.dispose();
            this.material.dispose();
            this.points = null;
        }
    }
}
