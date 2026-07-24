/**
 * audio-brain-canvas.js — 2D neural activity visualization for the audio/speech brain.
 *
 * Renders a radial brain layout showing cortical regions as arcs with activity-based
 * brightness, neuromodulator ambient glow, and speech event pulses.
 *
 * Data comes from neuro_update WebSocket messages (firing_rates, synapse_stats,
 * neuromodulation, stdp_deltas).
 */

const REGIONS = [
    // Inner ring: primitive
    { name: 'brainstem', label: 'Brainstem', ring: 0, startAngle: -0.3, endAngle: 0.3, color: [120, 180, 220] },
    { name: 'reflex_arc', label: 'Reflex', ring: 0, startAngle: 0.4, endAngle: 0.9, color: [100, 160, 200] },
    { name: 'cerebellum', label: 'Cerebellum', ring: 0, startAngle: -0.9, endAngle: -0.4, color: [140, 190, 230] },
    // Middle ring: cortical
    { name: 'sensory_cortex', label: 'Sensory', ring: 1, startAngle: -0.8, endAngle: -0.2, color: [168, 85, 247] },
    { name: 'association_cortex', label: 'Association', ring: 1, startAngle: -0.15, endAngle: 0.45, color: [130, 100, 230] },
    { name: 'working_memory', label: 'Working Mem', ring: 1, startAngle: 0.5, endAngle: 0.85, color: [100, 140, 240] },
    { name: 'feature_layer', label: 'Features', ring: 1, startAngle: -1.3, endAngle: -0.85, color: [150, 80, 210] },
    // Outer ring: output
    { name: 'motor_cortex', label: 'Motor/Speech', ring: 2, startAngle: -0.5, endAngle: 0.5, color: [232, 121, 249] },
    { name: 'predictive_layer', label: 'Predictive', ring: 2, startAngle: 0.6, endAngle: 1.2, color: [100, 200, 180] },
    { name: 'concept_layer', label: 'Concepts', ring: 2, startAngle: -1.2, endAngle: -0.6, color: [180, 120, 240] },
];

const RING_RADII = [0.18, 0.38, 0.58]; // fraction of canvas half-size
const ARC_WIDTH = [0.08, 0.12, 0.12];

export class AudioBrainViz {
    constructor(container) {
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        // State
        this.firingRates = {};
        this.neuromod = { da: 0, ach: 0, ne: 0, serotonin: 0, phase: 'infant' };
        this.stdpDeltas = {};
        this.synapseStats = {};
        this.speechPulse = 0; // decays from 1.0 on speech event
        this.particles = []; // flowing connection particles
        this._animId = null;
        this._lastTime = 0;

        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        const rect = this.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.w = rect.width;
        this.h = rect.height;
    }

    start() {
        if (this._animId) return;
        // Re-measure now that container is visible
        this._resize();
        this._lastTime = performance.now();
        const loop = (t) => {
            const dt = (t - this._lastTime) / 1000;
            this._lastTime = t;
            this._update(dt);
            this._draw();
            this._animId = requestAnimationFrame(loop);
        };
        this._animId = requestAnimationFrame(loop);
    }

    stop() {
        if (this._animId) {
            cancelAnimationFrame(this._animId);
            this._animId = null;
        }
    }

    /** Update from neuro_update message data */
    updateMetrics(data) {
        if (data.firing_rates) this.firingRates = data.firing_rates;
        if (data.neuromodulation) this.neuromod = data.neuromodulation;
        if (data.stdp_deltas) this.stdpDeltas = data.stdp_deltas;
        if (data.synapse_stats) this.synapseStats = data.synapse_stats;
    }

    /** Trigger speech pulse animation */
    triggerSpeechPulse() {
        this.speechPulse = 1.0;
        // Spawn particles from motor cortex outward
        const cx = this.w / 2;
        const cy = this.h / 2;
        const halfSize = Math.min(cx, cy) * 0.85;
        const motorRegion = REGIONS.find(r => r.name === 'motor_cortex');
        const angle = (motorRegion.startAngle + motorRegion.endAngle) / 2;
        const radius = halfSize * RING_RADII[2];
        for (let i = 0; i < 5; i++) {
            const a = angle + (Math.random() - 0.5) * 0.4;
            this.particles.push({
                x: cx + Math.cos(a) * radius,
                y: cy + Math.sin(a) * radius,
                vx: Math.cos(a) * (40 + Math.random() * 30),
                vy: Math.sin(a) * (40 + Math.random() * 30),
                life: 1.0,
                color: [232, 121, 249],
            });
        }
    }

    _update(dt) {
        // Decay speech pulse
        if (this.speechPulse > 0) {
            this.speechPulse = Math.max(0, this.speechPulse - dt * 2.5);
        }
        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt * 1.5;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
        // Spawn ambient connection particles between active regions
        if (Math.random() < dt * 3) {
            this._spawnConnectionParticle();
        }
    }

    _spawnConnectionParticle() {
        const cx = this.w / 2;
        const cy = this.h / 2;
        const halfSize = Math.min(cx, cy) * 0.85;

        // Pick two random regions with non-zero firing
        const active = REGIONS.filter(r => (this.firingRates[r.name] || 0) > 0.01);
        if (active.length < 2) return;
        const src = active[Math.floor(Math.random() * active.length)];
        let dst = active[Math.floor(Math.random() * active.length)];
        if (src === dst) return;

        const srcAngle = (src.startAngle + src.endAngle) / 2;
        const dstAngle = (dst.startAngle + dst.endAngle) / 2;
        const srcR = halfSize * RING_RADII[src.ring];
        const dstR = halfSize * RING_RADII[dst.ring];

        const sx = cx + Math.cos(srcAngle) * srcR;
        const sy = cy + Math.sin(srcAngle) * srcR;
        const dx = cx + Math.cos(dstAngle) * dstR;
        const dy = cy + Math.sin(dstAngle) * dstR;

        const speed = 60 + Math.random() * 40;
        const dist = Math.hypot(dx - sx, dy - sy);
        const life = dist / speed;

        this.particles.push({
            x: sx, y: sy,
            vx: (dx - sx) / life,
            vy: (dy - sy) / life,
            life: life,
            color: src.color,
        });
    }

    _draw() {
        const ctx = this.ctx;
        const cx = this.w / 2;
        const cy = this.h / 2;
        const halfSize = Math.min(cx, cy) * 0.85;

        // Clear with dark background
        ctx.fillStyle = '#0a0e1a';
        ctx.fillRect(0, 0, this.w, this.h);

        // Neuromodulator ambient glow (centered radial gradient)
        const da = this.neuromod.da || 0;
        const ach = this.neuromod.ach || 0;
        const ne = this.neuromod.ne || 0;
        const sero = this.neuromod.serotonin || 0;
        // Blend neuromodulator colors: DA=gold, ACh=cyan, NE=red, 5-HT=purple
        const glowR = Math.min(255, da * 180 + ne * 200 + sero * 100);
        const glowG = Math.min(255, da * 150 + ach * 180);
        const glowB = Math.min(255, ach * 200 + sero * 200 + ne * 50);
        const glowAlpha = Math.min(0.15, (da + ach + ne + sero) * 0.03);

        if (glowAlpha > 0.01) {
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, halfSize * 0.9);
            grad.addColorStop(0, `rgba(${glowR|0},${glowG|0},${glowB|0},${glowAlpha.toFixed(3)})`);
            grad.addColorStop(1, 'rgba(10,14,26,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, this.w, this.h);
        }

        // Draw region arcs
        for (const region of REGIONS) {
            const rate = this.firingRates[region.name] || 0;
            const radius = halfSize * RING_RADII[region.ring];
            const arcW = halfSize * ARC_WIDTH[region.ring];

            // Activity determines brightness (0.15 base up to 1.0)
            const brightness = 0.15 + Math.min(rate * 5, 0.85);
            const [r, g, b] = region.color;

            ctx.beginPath();
            ctx.arc(cx, cy, radius, region.startAngle * Math.PI, region.endAngle * Math.PI);
            ctx.lineWidth = arcW;
            ctx.lineCap = 'round';

            // Glow for active regions
            if (rate > 0.02) {
                ctx.shadowColor = `rgba(${r},${g},${b},${brightness * 0.6})`;
                ctx.shadowBlur = arcW * brightness;
            } else {
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
            }

            ctx.strokeStyle = `rgba(${r},${g},${b},${brightness.toFixed(2)})`;
            ctx.stroke();

            // Speech pulse highlight on motor cortex
            if (region.name === 'motor_cortex' && this.speechPulse > 0) {
                ctx.beginPath();
                ctx.arc(cx, cy, radius, region.startAngle * Math.PI, region.endAngle * Math.PI);
                ctx.lineWidth = arcW + 4;
                ctx.strokeStyle = `rgba(232,121,249,${(this.speechPulse * 0.7).toFixed(2)})`;
                ctx.shadowColor = `rgba(232,121,249,${this.speechPulse.toFixed(2)})`;
                ctx.shadowBlur = 12;
                ctx.stroke();
            }

            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
        }

        // Draw region labels
        ctx.font = '9px SF Mono, Fira Code, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const region of REGIONS) {
            const rate = this.firingRates[region.name] || 0;
            const radius = halfSize * RING_RADII[region.ring];
            const midAngle = ((region.startAngle + region.endAngle) / 2) * Math.PI;
            const labelR = radius + halfSize * ARC_WIDTH[region.ring] * 0.8;
            const lx = cx + Math.cos(midAngle) * labelR;
            const ly = cy + Math.sin(midAngle) * labelR;
            const alpha = 0.3 + Math.min(rate * 3, 0.7);
            ctx.fillStyle = `rgba(200,214,229,${alpha.toFixed(2)})`;
            ctx.fillText(region.label, lx, ly);
            // Show firing rate below label
            if (rate > 0.001) {
                ctx.fillStyle = `rgba(168,85,247,${alpha.toFixed(2)})`;
                ctx.fillText((rate * 100).toFixed(1) + '%', lx, ly + 11);
            }
        }

        // Draw center info (phase + step)
        ctx.textAlign = 'center';
        ctx.font = '11px SF Mono, Fira Code, monospace';
        ctx.fillStyle = 'rgba(200,214,229,0.7)';
        const phase = this.neuromod.phase || '--';
        ctx.fillText(phase.toUpperCase(), cx, cy - 8);
        ctx.font = '9px SF Mono, Fira Code, monospace';
        ctx.fillStyle = 'rgba(168,85,247,0.6)';
        // DA indicator
        const daLabel = `DA: ${(da).toFixed(2)}  ACh: ${(ach).toFixed(2)}`;
        ctx.fillText(daLabel, cx, cy + 8);
        const neLabel = `NE: ${(ne).toFixed(2)}  5-HT: ${(sero).toFixed(2)}`;
        ctx.fillText(neLabel, cx, cy + 20);

        // Draw particles
        for (const p of this.particles) {
            const [r, g, b] = p.color;
            const alpha = p.life * 0.8;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
            ctx.fill();
        }

        // STDP activity ring (very subtle outer ring showing total learning)
        const totalDelta = Object.values(this.stdpDeltas).reduce((s, v) => s + Math.abs(v || 0), 0);
        if (totalDelta > 0.0001) {
            const outerR = halfSize * 0.72;
            const intensity = Math.min(totalDelta * 50, 0.5);
            ctx.beginPath();
            ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
            ctx.lineWidth = 1;
            ctx.strokeStyle = `rgba(56,217,122,${intensity.toFixed(2)})`;
            ctx.stroke();
        }
    }
}
