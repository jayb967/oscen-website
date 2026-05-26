/**
 * Pulse glow synapse system.
 * Renders smooth light pulses traveling along synapse pathways between
 * brain regions -- like signals through fiber optic cables. Each pathway
 * is a translucent tube with moving hotspots of light that bloom naturally.
 *
 * Drop-in replacement for BrainSynapses (same public interface):
 *   constructor(scene, regions)
 *   setFiringRates(rates)
 *   setNeuromodulation(nm)
 *   setPulseColors(colorMap)   -- benchmark mode: per-pathway color override
 *   update(dt)
 */
import * as THREE from 'three';
import { SYNAPSE_PATHWAYS } from './data-bridge.js';

// ── Constants ──────────────────────────────────────────────────────────
const TUBE_RADIUS = 0.025;
const TUBE_SEGMENTS = 48;
const TUBE_RADIAL_SEGMENTS = 6;
const BASE_OPACITY = 0.10;
const PULSE_SPEED_MIN = 0.9;
const PULSE_SPEED_MAX = 1.6;
const PULSE_WIDTH = 0.02;          // gaussian sigma along curve-t (very tight bursts)
const MAX_PULSES_PER_PATHWAY = 14;
const SPAWN_COOLDOWN = 0.03;       // min seconds between pulse spawns per pathway
const FIRING_THRESHOLD = 0.003;    // min src firing rate to spawn pulses

// Brain centroid for radial curve arcing
const BRAIN_CENTER = new THREE.Vector3(0, 0.5, -0.5);

// ── Default colors ─────────────────────────────────────────────────────
const COLOR_NORMAL = new THREE.Color(0.15, 0.75, 0.95);   // cyan
const COLOR_RETAINED = new THREE.Color(0.22, 0.85, 0.48);  // green
const COLOR_PARTIAL = new THREE.Color(0.96, 0.65, 0.14);   // amber
const COLOR_LOST = new THREE.Color(0.95, 0.27, 0.27);      // red

// ── GLSL ───────────────────────────────────────────────────────────────
const TUBE_VERTEX = /* glsl */ `
    attribute float curveT;
    varying float vCurveT;
    varying vec3 vWorldPos;
    void main() {
        vCurveT = curveT;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
`;

const TUBE_FRAGMENT = /* glsl */ `
    uniform vec3 uColor;
    uniform float uBaseOpacity;
    uniform float uPulsePositions[${MAX_PULSES_PER_PATHWAY}];
    uniform float uPulseIntensities[${MAX_PULSES_PER_PATHWAY}];
    uniform int uPulseCount;
    uniform float uDaWarmth;

    varying float vCurveT;
    varying vec3 vWorldPos;

    void main() {
        // Sum contributions from all active pulses
        float brightness = 0.0;
        for (int i = 0; i < ${MAX_PULSES_PER_PATHWAY}; i++) {
            if (i >= uPulseCount) break;
            float dist = abs(vCurveT - uPulsePositions[i]);
            float pulse = exp(-dist * dist / (2.0 * ${PULSE_WIDTH.toFixed(4)} * ${PULSE_WIDTH.toFixed(4)}));
            brightness += pulse * uPulseIntensities[i];
        }
        brightness = min(brightness, 1.5);

        // Warm shift from dopamine
        vec3 color = uColor;
        color.r += uDaWarmth * 0.08;

        // Base tube visibility + pulse glow
        float alpha = uBaseOpacity + brightness * (1.0 - uBaseOpacity);

        // Feed bloom: overbright where pulses are
        vec3 finalColor = color * (0.3 + brightness * 1.2);
        gl_FragColor = vec4(finalColor, alpha);
    }
`;

// ── Pulse data object ──────────────────────────────────────────────────
class Pulse {
    constructor(speed) {
        this.t = 0.0;             // position along curve (0 = src, 1 = dst)
        this.speed = speed;       // units per second
        this.intensity = 1.0;     // brightness multiplier
    }

    update(dt) {
        this.t += this.speed * dt;
    }

    get expired() {
        return this.t > 1.15; // allow slight overshoot for smooth exit
    }
}

// ── Main system ────────────────────────────────────────────────────────
export class BrainPulses {
    constructor(scene, regions) {
        this.scene = scene;
        this.regions = regions;
        this.firingRates = {};
        this.neuromodulation = { da: 1.2, ne: 1.2, serotonin: 1.0 };

        // Per-pathway state
        this.pathways = [];
        this._spawnTimers = {};
        this._pulseColorOverrides = {};  // pathway.id -> THREE.Color

        this._buildPathways();
    }

    _buildPathways() {
        for (const pathway of SYNAPSE_PATHWAYS) {
            const srcCenter = this.regions.getCenter(pathway.src);
            const dstCenter = this.regions.getCenter(pathway.dst);

            // Cubic bezier with two control points pushed outward from brain center
            // so curves arc along the brain's surface instead of cutting through
            const pathLen = srcCenter.distanceTo(dstCenter);
            const arcAmount = pathLen * 0.35;

            // Use pathway index for deterministic left/right alternation
            const pwIndex = SYNAPSE_PATHWAYS.indexOf(pathway);
            const xSign = (pwIndex % 2 === 0) ? 1 : -1;

            let curve;
            if (pathway.src === pathway.dst) {
                // Self-loops: arc outward from the region, creating a visible loop
                const selfRadial = new THREE.Vector3()
                    .subVectors(srcCenter, BRAIN_CENTER).normalize();
                const loopUp = new THREE.Vector3(0, 1, 0);
                const loopSide = new THREE.Vector3().crossVectors(selfRadial, loopUp).normalize();
                const cp1 = srcCenter.clone().add(selfRadial.clone().multiplyScalar(1.2))
                    .add(loopSide.clone().multiplyScalar(0.6));
                const cp2 = srcCenter.clone().add(selfRadial.clone().multiplyScalar(1.2))
                    .add(loopSide.clone().multiplyScalar(-0.6));
                curve = new THREE.CubicBezierCurve3(srcCenter.clone(), cp1, cp2, dstCenter.clone());
            } else {
                // X-axis spread: alternate left/right so tubes fan out in 3D
                // Longer paths get more spread for visual separation
                const xSpread = pathLen * 0.25 * xSign;

                const cp1 = new THREE.Vector3().lerpVectors(srcCenter, dstCenter, 0.3);
                const radial1 = new THREE.Vector3().subVectors(cp1, BRAIN_CENTER).normalize();
                cp1.add(radial1.multiplyScalar(arcAmount));
                cp1.x += xSpread;

                const cp2 = new THREE.Vector3().lerpVectors(srcCenter, dstCenter, 0.7);
                const radial2 = new THREE.Vector3().subVectors(cp2, BRAIN_CENTER).normalize();
                cp2.add(radial2.multiplyScalar(arcAmount));
                cp2.x += xSpread;

                curve = new THREE.CubicBezierCurve3(srcCenter.clone(), cp1, cp2, dstCenter.clone());
            }

            // Build tube geometry with curveT attribute
            const tubeGeo = new THREE.TubeGeometry(
                curve, TUBE_SEGMENTS, TUBE_RADIUS, TUBE_RADIAL_SEGMENTS, false
            );
            this._addCurveTAttribute(tubeGeo, curve);

            // Source region color as default
            const regionInfo = this.regions.regionData[pathway.src];
            const baseColor = regionInfo
                ? regionInfo.baseColor.clone()
                : new THREE.Color(COLOR_NORMAL);

            // Custom shader material
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    uColor: { value: baseColor },
                    uBaseOpacity: { value: BASE_OPACITY },
                    uPulsePositions: { value: new Float32Array(MAX_PULSES_PER_PATHWAY) },
                    uPulseIntensities: { value: new Float32Array(MAX_PULSES_PER_PATHWAY) },
                    uPulseCount: { value: 0 },
                    uDaWarmth: { value: 0.0 },
                },
                vertexShader: TUBE_VERTEX,
                fragmentShader: TUBE_FRAGMENT,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide,
            });

            const mesh = new THREE.Mesh(tubeGeo, material);
            mesh.frustumCulled = false;
            this.scene.add(mesh);

            this.pathways.push({
                ...pathway,
                curve,
                mesh,
                material,
                pulses: [],
                baseColor,
            });

            this._spawnTimers[pathway.id] = Math.random() * SPAWN_COOLDOWN;
        }
    }

    /**
     * Assign a curveT attribute to each vertex of a TubeGeometry so the
     * fragment shader knows where along the curve each fragment sits.
     */
    _addCurveTAttribute(geometry, curve) {
        const posAttr = geometry.getAttribute('position');
        const count = posAttr.count;
        const curveTValues = new Float32Array(count);

        // TubeGeometry lays out vertices in rings of (radialSegments + 1).
        // Each ring corresponds to one lengthwise sample.
        const ringsPerSegment = TUBE_RADIAL_SEGMENTS + 1;
        const totalRings = TUBE_SEGMENTS + 1;

        for (let i = 0; i < count; i++) {
            const ring = Math.floor(i / ringsPerSegment);
            curveTValues[i] = Math.min(ring / (totalRings - 1), 1.0);
        }

        geometry.setAttribute('curveT', new THREE.BufferAttribute(curveTValues, 1));
    }

    // ── Public interface (matches BrainSynapses) ───────────────────────

    setFiringRates(firingRates) {
        this.firingRates = firingRates;
    }

    setNeuromodulation(nm) {
        if (nm) this.neuromodulation = nm;
    }

    /**
     * Override pulse colors per pathway for benchmark retention display.
     * @param {Object} colorMap - { pathwayId: THREE.Color }
     * Pass null or {} to clear overrides and return to region colors.
     */
    setPulseColors(colorMap) {
        this._pulseColorOverrides = colorMap || {};
        for (const pw of this.pathways) {
            const override = this._pulseColorOverrides[pw.id];
            if (override) {
                pw.material.uniforms.uColor.value.copy(override);
            } else {
                pw.material.uniforms.uColor.value.copy(pw.baseColor);
            }
        }
    }

    /**
     * Convenience: set retention-coded colors from benchmark data.
     * @param {Object} retentionMap - { pathwayId: retentionFloat (0-1) }
     */
    setRetentionColors(retentionMap) {
        const colorMap = {};
        for (const [id, retention] of Object.entries(retentionMap)) {
            if (retention >= 0.8) {
                colorMap[id] = COLOR_RETAINED.clone();
            } else if (retention >= 0.5) {
                // Lerp amber toward green based on how close to 0.8
                const t = (retention - 0.5) / 0.3;
                colorMap[id] = COLOR_PARTIAL.clone().lerp(COLOR_RETAINED, t);
            } else {
                // Lerp red toward amber based on how close to 0.5
                const t = retention / 0.5;
                colorMap[id] = COLOR_LOST.clone().lerp(COLOR_PARTIAL, t);
            }
        }
        this.setPulseColors(colorMap);
    }

    update(dt) {
        this._spawnPulses(dt);
        this._updatePulses(dt);
        this._syncUniforms();
    }

    // ── Internal ───────────────────────────────────────────────────────

    _spawnPulses(dt) {
        const serotonin = this.neuromodulation.serotonin || 1.0;
        const serotoninDampen = Math.max(0.3, 1.0 - (serotonin - 0.5) * 0.3);

        for (const pw of this.pathways) {
            this._spawnTimers[pw.id] -= dt;
            if (this._spawnTimers[pw.id] > 0) continue;

            const srcRate = this.firingRates[pw.src] || 0;
            if (srcRate < FIRING_THRESHOLD) continue;
            if (pw.pulses.length >= MAX_PULSES_PER_PATHWAY) continue;

            const spawnProb = srcRate * 50 * serotoninDampen;
            if (Math.random() > spawnProb * dt * 10) continue;

            const speed = PULSE_SPEED_MIN + Math.random() * (PULSE_SPEED_MAX - PULSE_SPEED_MIN);
            pw.pulses.push(new Pulse(speed));

            // Cooldown scales with activity: more active = tighter spacing
            const intensity = Math.min(1.0, Math.sqrt(srcRate * 5.0));
            this._spawnTimers[pw.id] = SPAWN_COOLDOWN + (1 - intensity) * 0.12;
        }
    }

    _updatePulses(dt) {
        for (const pw of this.pathways) {
            for (const pulse of pw.pulses) {
                pulse.update(dt);
                // Fade in at start, fade out at end
                if (pulse.t < 0.1) {
                    pulse.intensity = pulse.t / 0.1;
                } else if (pulse.t > 0.9) {
                    pulse.intensity = Math.max(0, (1.15 - pulse.t) / 0.25);
                } else {
                    pulse.intensity = 1.0;
                }
            }
            pw.pulses = pw.pulses.filter(p => !p.expired);
        }
    }

    _syncUniforms() {
        const daWarmth = Math.max(0, (this.neuromodulation.da || 1.2) - 1.0);

        for (const pw of this.pathways) {
            const unis = pw.material.uniforms;
            unis.uPulseCount.value = pw.pulses.length;
            unis.uDaWarmth.value = daWarmth;

            const posArr = unis.uPulsePositions.value;
            const intArr = unis.uPulseIntensities.value;
            for (let i = 0; i < MAX_PULSES_PER_PATHWAY; i++) {
                if (i < pw.pulses.length) {
                    posArr[i] = pw.pulses[i].t;
                    intArr[i] = pw.pulses[i].intensity;
                } else {
                    posArr[i] = -10.0; // off-screen
                    intArr[i] = 0.0;
                }
            }
        }
    }

    dispose() {
        for (const pw of this.pathways) {
            this.scene.remove(pw.mesh);
            pw.mesh.geometry.dispose();
            pw.material.dispose();
        }
        this.pathways = [];
    }
}

// ── Retention color helpers (exported for use in benchmark pages) ──────
export { COLOR_NORMAL, COLOR_RETAINED, COLOR_PARTIAL, COLOR_LOST };
