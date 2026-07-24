/**
 * Main scene — orchestrates the 3D brain visualization.
 * Sets up Three.js renderer, camera, post-processing, and coordinates
 * data flow between DataBridge, BrainRegions, and BrainSynapses.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { DataBridge, REGIONS } from './data-bridge.js?v=5';
import { BrainRegions } from './brain-regions.js?v=4';
import { BrainSynapses } from './brain-synapses.js';
import { BrainPulses } from './brain-pulses.js?v=5';

export class BrainScene {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.clock = new THREE.Clock();
        this._lastMetrics = null;

        // Parse URL params early -- bloom and component init depend on them
        const params = new URLSearchParams(window.location.search);
        this._liveWsUrl = params.get('ws') || this._detectLiveWsUrl();
        this.embedMode = params.get('embed') === 'true';
        this.showLabels = params.get('labels') !== 'false';
        // Pulses are the default; pass ?pulses=false to revert to lightning bolts
        this.usePulses = params.get('pulses') !== 'false';

        this._initRenderer();
        this._initScene();
        this._initCamera();
        this._initLights();
        this._initPostProcessing();
        this._initControls();

        // Starfield background for depth
        this._addStarfield();

        // Build brain components
        this.brainRegions = new BrainRegions(this.scene);
        this.brainSynapses = this.usePulses
            ? new BrainPulses(this.scene, this.brainRegions)
            : new BrainSynapses(this.scene, this.brainRegions);

        // Data bridge
        this.dataBridge = new DataBridge();
        this.dataBridge.onMetrics((m) => this._onMetrics(m));
        this.dataBridge.onBenchmark((b) => this._onBenchmark(b));

        // Embed mode: hide HUD for clean iframe embedding
        if (this.embedMode) {
            const hud = document.getElementById('hud');
            const status = document.getElementById('connection-status');
            if (hud) hud.style.display = 'none';
            if (status) status.style.display = 'none';
        }

        // Wire up toggle button
        const statusBtn = document.getElementById('connection-status');
        if (statusBtn) {
            statusBtn.addEventListener('click', () => this._toggleMode());
        }

        // Default to live mode — fall back to simulated if connection fails
        if (params.get('mode') === 'sim') {
            this.dataBridge.startSimulated();
        } else {
            this.dataBridge.startLive(this._liveWsUrl);
        }

        // Region labels (HTML overlay)
        this._createRegionLabels();

        // postMessage focus handler (option 10: morphing brain). Lets a
        // parent page (e.g. reaction.html module switcher) request the
        // camera glide to a specific region and dim the rest.
        this._initFocusHandler();

        // Subclass extension seam (cinematic version adds the GLB shell / IBL
        // / cinematic post here). No-op in the classic scene.
        this._initEnhancements();

        // Handle resize
        window.addEventListener('resize', () => this._onResize());

        // Start render loop
        this._animate();
    }

    /**
     * Extension hooks for the cinematic subclass. Base scene is a no-op so the
     * classic look is unchanged. Called at end of constructor (`_initEnhancements`)
     * and each frame before render (`_updateEnhancements`).
     */
    _initEnhancements() {}
    _updateEnhancements(_dt) {}

    _detectLiveWsUrl() {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        // demo.oscen.ai: nginx on standard port proxies /ws to dashboard
        if (host === 'demo.oscen.ai') {
            return `${proto}//${host}/ws`;
        }
        // Direct access: dashboard on port 8080
        return `${proto}//${host}:8080/ws`;
    }

    _toggleMode() {
        if (!this._liveWsUrl) return;
        this.dataBridge.toggle(this._liveWsUrl);
    }

    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x0a0e1a, 1);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.container.appendChild(this.renderer.domElement);
    }

    _initScene() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x0a0e1a, 0.014);
    }

    _initCamera() {
        this.camera = new THREE.PerspectiveCamera(
            50,
            window.innerWidth / window.innerHeight,
            0.1,
            100,
        );
        this.camera.position.set(14, 4, 8);
        this.camera.lookAt(0, 0.5, -0.5);
    }

    _initLights() {
        // Subtle ambient
        this.ambientLight = new THREE.AmbientLight(0x1a2a4a, 0.3);
        this.scene.add(this.ambientLight);

        // Key light — soft blue from above (DA shifts this warm)
        this.keyLight = new THREE.PointLight(0x4488cc, 0.5, 30);
        this.keyLight.position.set(5, 10, 5);
        this.scene.add(this.keyLight);

        // Fill light — warm from below
        this.fillLight = new THREE.PointLight(0x442244, 0.3, 25);
        this.fillLight.position.set(-5, -5, -5);
        this.scene.add(this.fillLight);

        // Rim light — bright accent from behind
        this.rimLight = new THREE.PointLight(0x88aaff, 0.4, 20);
        this.rimLight.position.set(-3, 3, -10);
        this.scene.add(this.rimLight);

        // Smoothed neuromodulation for scene effects
        this._smoothNm = { da: 1.2, ach: 1.2, ne: 1.2, serotonin: 1.0, oxytocin: 0.8 };
    }

    _initPostProcessing() {
        this.composer = new EffectComposer(this.renderer);

        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Bloom settings differ: pulses want softer, wider glow; bolts want sharper corona
        const bloomStrength = this.usePulses ? 1.0 : 0.8;
        const bloomRadius   = this.usePulses ? 0.7 : 0.5;
        const bloomThresh   = this.usePulses ? 0.5 : 0.7;
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            bloomStrength,
            bloomRadius,
            bloomThresh,
        );
        this.composer.addPass(this.bloomPass);
    }

    _initControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.rotateSpeed = 0.5;
        this.controls.zoomSpeed = 0.8;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.3;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 25;
        this.controls.target.set(0, 0.5, -0.5);
    }

    _addStarfield() {
        const count = 500;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            positions[i * 3]     = (Math.random() - 0.5) * 80;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 80;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0x334466,
            size: 0.08,
            transparent: true,
            opacity: 0.4,
        });
        this.scene.add(new THREE.Points(geo, mat));
    }

    _createRegionLabels() {
        this.regionLabels = {};
        if (!this.showLabels) return;
        const labelContainer = document.createElement('div');
        labelContainer.style.position = 'absolute';
        labelContainer.style.top = '0';
        labelContainer.style.left = '0';
        labelContainer.style.width = '100%';
        labelContainer.style.height = '100%';
        labelContainer.style.pointerEvents = 'none';
        labelContainer.style.overflow = 'visible';
        document.body.appendChild(labelContainer);

        for (const region of REGIONS) {
            const label = document.createElement('div');
            label.className = 'region-label';

            // Label text + firing rate
            const nameSpan = document.createElement('span');
            nameSpan.textContent = region.label;
            const rateSpan = document.createElement('span');
            rateSpan.className = 'rate';
            rateSpan.textContent = '';
            label.appendChild(nameSpan);
            label.appendChild(rateSpan);

            // Tooltip (shown on hover)
            const tooltip = document.createElement('div');
            tooltip.className = 'region-tooltip';
            const ttName = document.createElement('div');
            ttName.className = 'tt-name';
            ttName.textContent = region.label;
            const ttNeurons = document.createElement('div');
            ttNeurons.className = 'tt-neurons';
            ttNeurons.textContent = this._formatNum(region.neurons) + ' neurons';
            const ttDesc = document.createElement('div');
            ttDesc.className = 'tt-desc';
            ttDesc.textContent = region.description || '';
            tooltip.appendChild(ttName);
            tooltip.appendChild(ttNeurons);
            tooltip.appendChild(ttDesc);
            if (region.connections) {
                const ttConn = document.createElement('div');
                ttConn.className = 'tt-connections';
                ttConn.textContent = region.connections;
                tooltip.appendChild(ttConn);
            }
            label.appendChild(tooltip);

            // Pause auto-rotate on hover for easier reading
            label.addEventListener('mouseenter', () => {
                this.controls.autoRotate = false;
            });
            label.addEventListener('mouseleave', () => {
                this.controls.autoRotate = true;
            });

            labelContainer.appendChild(label);
            this.regionLabels[region.id] = { el: label, rateEl: rateSpan, neuronsEl: ttNeurons };
        }
    }

    _updateRegionLabels() {
        if (!this.showLabels) return;
        const halfW = window.innerWidth / 2;
        const halfH = window.innerHeight / 2;

        for (const region of REGIONS) {
            const entry = this.regionLabels[region.id];
            if (!entry) continue;
            const label = entry.el;

            const center = this.brainRegions.getCenter(region.id);
            const projected = center.clone().project(this.camera);

            // Check if behind camera
            if (projected.z > 1) {
                label.style.display = 'none';
                continue;
            }

            const x = projected.x * halfW + halfW;
            const y = -projected.y * halfH + halfH;

            label.style.display = 'block';
            label.style.left = `${x}px`;
            label.style.top = `${y}px`;
            label.style.transform = 'translate(-50%, -50%)';

            // Flip tooltip below if label is in upper portion of screen
            const tooltip = label.querySelector('.region-tooltip');
            if (tooltip) {
                if (y < window.innerHeight * 0.35) {
                    tooltip.style.bottom = 'auto';
                    tooltip.style.top = 'calc(100% + 8px)';
                    tooltip.classList.add('flipped');
                } else {
                    tooltip.style.bottom = 'calc(100% + 8px)';
                    tooltip.style.top = 'auto';
                    tooltip.classList.remove('flipped');
                }
            }

            // Active state when firing
            const data = this.brainRegions.regionData[region.id];
            if (data && data.currentRate > 0.02) {
                label.classList.add('active');
                const pct = (data.currentRate * 100).toFixed(1);
                entry.rateEl.textContent = pct + '%';
                entry.neuronsEl.textContent = this._formatNum(region.neurons) + ' neurons \u00B7 firing ' + pct + '%';
            } else {
                label.classList.remove('active');
                entry.rateEl.textContent = '';
                entry.neuronsEl.textContent = this._formatNum(region.neurons) + ' neurons';
            }
        }
    }

    _onMetrics(metrics) {
        this._lastMetrics = metrics;

        // Update brain regions
        this.brainRegions.setFiringRates(metrics.firingRates);

        // Update synapses
        this.brainSynapses.setFiringRates(metrics.firingRates);
        this.brainSynapses.setNeuromodulation(metrics.neuromodulation);

        // Update HUD
        this._updateHUD(metrics);

        // Update smoothed neuromodulation target
        const nm = metrics.neuromodulation || {};
        if (nm.da !== undefined) this._targetNm = nm;
    }

    /** Apply benchmark retention colors to synapse pathways (pulse mode only) */
    _onBenchmark(benchmarkData) {
        if (!benchmarkData || !benchmarkData.retention) return;
        if (this.brainSynapses.setRetentionColors) {
            this.brainSynapses.setRetentionColors(benchmarkData.retention);
        }
    }

    /** Scene-wide neuromodulation visual effects */
    _updateNeuromodEffects(dt) {
        if (!this._targetNm) return;
        const lerp = Math.min(1, dt * 2);
        const nm = this._smoothNm;
        const target = this._targetNm;

        nm.da += (( target.da || 1.2) - nm.da) * lerp;
        nm.ne += ((target.ne || 1.2) - nm.ne) * lerp;
        nm.serotonin += ((target.serotonin || 1.0) - nm.serotonin) * lerp;
        nm.oxytocin += ((target.oxytocin || 0.8) - nm.oxytocin) * lerp;

        // DA → warm shift on key light (high DA = more orange/yellow)
        const daWarm = Math.max(0, (nm.da - 0.8) * 0.3);
        this.keyLight.color.setRGB(
            0.27 + daWarm * 0.4,   // more red when DA high
            0.53 - daWarm * 0.1,   // slightly less green
            0.8  - daWarm * 0.3,   // less blue
        );

        // NE → increase bloom strength slightly (arousal = more glow)
        const neBoost = Math.max(0, (nm.ne - 0.8) * 0.15);
        const baseBloom = this.usePulses ? 1.0 : 0.8;
        this.bloomPass.strength = baseBloom + neBoost;

        // 5-HT → cool ambient shift (high serotonin = calmer, bluer)
        const shtCalm = Math.max(0, (nm.serotonin - 0.5) * 0.15);

        // OT -> pink social-warmth tint on ambient (bonding/empathy)
        const otWarm = Math.max(0, (nm.oxytocin || 0) - 0.5) * 0.08;

        this.ambientLight.color.setRGB(
            0.1 - shtCalm * 0.03 + otWarm * 0.04,
            0.16 + shtCalm * 0.02,
            0.29 + shtCalm * 0.05 + otWarm * 0.02,
        );
    }

    _updateHUD(m) {
        const el = (id) => document.getElementById(id);

        el('hud-neurons').textContent = this._formatNum(m.totalNeurons);
        el('hud-synapses').textContent = '1.31B';
        el('hud-step').textContent = this._formatNum(m.step);
        el('hud-rate').textContent = m.stepsPerSec.toFixed(2);

        // Phase badge
        const phaseEl = el('hud-phase');
        const phase = (m.neuromodulation && m.neuromodulation.phase) || 'unknown';
        phaseEl.textContent = phase.charAt(0).toUpperCase() + phase.slice(1);
        phaseEl.className = 'hud-phase ' + phase;

        // Neuromodulator bars
        const nm = m.neuromodulation || {};
        const maxNm = 3.0;
        this._setBarHeight('nm-da', (nm.da || 0) / maxNm);
        this._setBarHeight('nm-ach', (nm.ach || 0) / maxNm);
        this._setBarHeight('nm-ne', (nm.ne || 0) / maxNm);
        this._setBarHeight('nm-sht', (nm.serotonin || 0) / maxNm);
        this._setBarHeight('nm-ot', (nm.oxytocin || 0) / maxNm);
    }

    _setBarHeight(id, pct) {
        const el = document.getElementById(id);
        if (el) el.style.height = `${Math.min(100, Math.max(0, pct * 100))}%`;
    }

    _formatNum(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return String(n);
    }

    _onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.composer.setSize(w, h);
        this.bloomPass.resolution.set(w, h);
    }

    _animate() {
        requestAnimationFrame(() => this._animate());
        const dt = Math.min(this.clock.getDelta(), 0.05); // Cap dt to avoid jumps

        // Smooth glide controls.target toward _focusTarget if one is set.
        // OrbitControls handles the camera position dampened around the new
        // target, so we get a free cinematic pan.
        if (this._focusTarget) {
            this.controls.target.lerp(this._focusTarget, 0.06);
        }

        // Update components. While Beliefs Mode is active we skip the
        // synapse update so no new pulses spawn and the existing tubes
        // stay hidden (per setDim(1.0)).
        this.controls.update();
        this.brainRegions.update(dt);
        if (!this._beliefsMode) this.brainSynapses.update(dt);
        this._updateNeuromodEffects(dt);
        if (this._brainBeliefs) this._brainBeliefs.update(dt);

        // Update region labels
        this._updateRegionLabels();

        // Subclass per-frame hook (cinematic shell rotation, cross-section, etc.)
        this._updateEnhancements(dt);

        // Render with post-processing
        this.composer.render();
    }

    // ─── Module focus handler (option 10) ──────────────────────────
    // Parent page postMessages `{ type: 'oscen.focusRegion', region: <label> }`
    // when the user switches modules. `region` is the human-readable label
    // from REGIONS (e.g. "Motor Cortex"); null resets to the default view.
    _initFocusHandler() {
        // Stash the defaults so we can restore on null/clear.
        this._defaultTarget = new THREE.Vector3(0, 0.5, -0.5);
        this._defaultAutoRotate = this.controls.autoRotate;
        this._focusTarget = null;            // Vector3 the camera target lerps to
        this._focusedRegionId = null;        // For label dim/highlight
        this._beliefsMode = false;
        this._beliefsToken = 0;              // Race-safe lazy show/hide guard
        this._raycaster = new THREE.Raycaster();
        this._mouseNdc = new THREE.Vector2();
        this._mouseDownPos = null;

        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (!msg) return;
            if (msg.type === 'oscen.focusRegion') {
                this._focusOnRegion(msg.region);
            } else if (msg.type === 'oscen.beliefs.show') {
                this._showBeliefs();
            } else if (msg.type === 'oscen.beliefs.hide') {
                this._hideBeliefs();
            } else if (msg.type === 'oscen.beliefs.cascade') {
                if (this._brainBeliefs && this._brainBeliefs.isVisible()) {
                    this._brainBeliefs.pulseCascade(msg.beliefIds || [], msg.color);
                }
            }
        });

        // Click → raycast against belief constellation (only when visible).
        // Track mousedown position so an orbit-drag doesn't fire a click.
        const dom = this.renderer.domElement;
        dom.addEventListener('mousedown', (e) => {
            this._mouseDownPos = { x: e.clientX, y: e.clientY };
        });
        dom.addEventListener('mouseup', (e) => {
            if (!this._mouseDownPos) return;
            const dx = e.clientX - this._mouseDownPos.x;
            const dy = e.clientY - this._mouseDownPos.y;
            this._mouseDownPos = null;
            if (dx * dx + dy * dy > 25) return;   // moved >5px = drag, not click
            this._handleSceneClick(e);
        });
    }

    _handleSceneClick(e) {
        if (!this._brainBeliefs || !this._brainBeliefs.isVisible()) return;
        const meshes = this._brainBeliefs.getNodeMeshes();
        if (!meshes || meshes.length === 0) return;

        const rect = this.renderer.domElement.getBoundingClientRect();
        this._mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this._mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this._raycaster.setFromCamera(this._mouseNdc, this.camera);
        const hits = this._raycaster.intersectObjects(meshes, false);
        if (hits.length === 0) {
            this._brainBeliefs.highlight(null);
            this._postToParent({ type: 'oscen.beliefs.nodeCleared' });
            return;
        }
        const belief = hits[0].object.userData.belief;
        this._brainBeliefs.highlight(belief.id);
        this._postToParent({ type: 'oscen.beliefs.nodeClicked', belief });
    }

    _postToParent(msg) {
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(msg, '*');
            }
        } catch (_) {}
    }

    // ─── Beliefs constellation (lazy-loaded module) ───────────────
    // Race-safe via a monotonically-incrementing token. The async show()
    // can be raced by a fast user (open Beliefs → Esc → open Probe).
    // After each await, we re-check the token; if it changed, bail.
    async _showBeliefs() {
        const myToken = ++this._beliefsToken;
        if (!this._brainBeliefs) {
            try {
                const mod = await import('./brain-beliefs.js?v=2');
                if (myToken !== this._beliefsToken) return;
                this._brainBeliefs = new mod.BrainBeliefs(this.scene, this.brainRegions);
            } catch (err) {
                console.warn('[BrainScene] failed to load brain-beliefs.js:', err);
                return;
            }
        }
        await this._brainBeliefs.show();
        if (myToken !== this._beliefsToken) {
            this._brainBeliefs.hide();
            return;
        }
        this._enterBeliefsMode();
    }

    _hideBeliefs() {
        this._beliefsToken = (this._beliefsToken || 0) + 1;
        if (this._brainBeliefs) this._brainBeliefs.hide();
        this._exitBeliefsMode();
    }

    /** Dim the cortex + synapse tubes + region labels, stop autorotate.
     *  Also drop bloom strength so additive material residue doesn't
     *  bleed across the belief constellation. */
    _enterBeliefsMode() {
        if (this._beliefsMode) return;
        this._beliefsMode = true;
        this.brainRegions.setDim(1.0);
        if (this.brainSynapses && this.brainSynapses.setDim) this.brainSynapses.setDim(1.0);
        document.body.classList.add('oscen-beliefs-mode');
        this.controls.autoRotate = false;
        if (this.bloomPass) {
            this._savedBloomStrength = this.bloomPass.strength;
            this.bloomPass.strength = 0.18;
        }
    }
    _exitBeliefsMode() {
        if (!this._beliefsMode) return;
        this._beliefsMode = false;
        this.brainRegions.setDim(0);
        if (this.brainSynapses && this.brainSynapses.setDim) this.brainSynapses.setDim(0);
        document.body.classList.remove('oscen-beliefs-mode');
        if (this.bloomPass && this._savedBloomStrength != null) {
            this.bloomPass.strength = this._savedBloomStrength;
            this._savedBloomStrength = null;
        }
        // Restore autorotate only if no focus is locked (focus also kills autorotate).
        if (!this._focusedRegionId) this.controls.autoRotate = this._defaultAutoRotate;
    }

    _focusOnRegion(regionLabel) {
        // Null / empty → restore the default wide view.
        if (!regionLabel) {
            this._focusTarget = this._defaultTarget.clone();
            this._focusedRegionId = null;
            this.controls.autoRotate = this._defaultAutoRotate;
            this._setLabelDim(null);
            return;
        }

        // Look up the region by its display label.
        const region = REGIONS.find(
            (r) => r.label.toLowerCase() === String(regionLabel).toLowerCase(),
        );
        if (!region) return;

        const center = this.brainRegions.getCenter(region.id);
        if (!center) return;

        // Stop auto-rotate so the focus sticks; lerp will glide the target
        // there over ~30 frames (controlled by the 0.06 lerp factor).
        this.controls.autoRotate = false;
        this._focusTarget = center.clone();
        this._focusedRegionId = region.id;
        this._setLabelDim(region.id);
    }

    _setLabelDim(focusedId) {
        if (!this.regionLabels) return;
        for (const id in this.regionLabels) {
            const entry = this.regionLabels[id];
            if (!entry || !entry.el) continue;
            if (focusedId == null) {
                entry.el.classList.remove('dimmed', 'focused');
            } else if (id === focusedId) {
                entry.el.classList.remove('dimmed');
                entry.el.classList.add('focused');
            } else {
                entry.el.classList.remove('focused');
                entry.el.classList.add('dimmed');
            }
        }
    }
}

/**
 * Boot entry used by the version-aware bootstrap in index.html.
 * (Auto-construction moved out of module scope so the cinematic subclass can
 * import BrainScene without spawning a second classic scene.)
 */
export function boot() {
    if (document.readyState === 'loading') {
        return new Promise((resolve) => {
            document.addEventListener('DOMContentLoaded', () => resolve(new BrainScene()));
        });
    }
    return new BrainScene();
}
