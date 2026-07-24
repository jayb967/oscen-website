/**
 * BrainModule -- the portable brain: regions + synapse pulses in one
 * THREE.Group, wired to a DataBridge. No renderer, no camera, no DOM.
 * Mount the group into any scene; scale/position it freely (the group is
 * what shrinks into the humanoid's head in the reveal sequence).
 *
 * Extracted from oscen/brain-viz (BrainScene owned all of this plus the
 * page). Render classes are ported verbatim; see docs/REDESIGN-REFERENCE.md.
 */
import * as THREE from 'three';
import { DataBridge, REGIONS } from './data-bridge.js';
import { BrainRegions } from './brain-regions.js';
import { BrainPulses } from './brain-pulses.js';
import { BrainShell } from './brain-shell.js';
import { BrainPointCloud } from './brain-pointcloud.js';
import { REGION_ANATOMY } from './region-anatomy.js';

export { REGIONS };

export class BrainModule {
    /**
     * @param {Object} options
     * @param {'sim'|'live'} [options.mode='sim'] -- data source. 'live' needs wsUrl.
     * @param {string|null} [options.wsUrl=null] -- WebSocket URL for live mode.
     * @param {DataBridge} [options.bridge] -- inject a shared bridge (else one is created).
     */
    constructor({ mode = 'sim', wsUrl = null, bridge = null } = {}) {
        this.group = new THREE.Group();

        this.regions = new BrainRegions(this.group);
        this.pulses = new BrainPulses(this.group, this.regions);

        // Cinematic layer (glass shell + GPU point cloud), loaded lazily by
        // loadCinematic() so the classic look paints first (LCP rule).
        this.shell = null;
        this.pointCloud = null;
        this._cloudBase = null;
        this._cinematicLoading = null;
        this._dim = 0;

        this._ownsBridge = !bridge;
        this.bridge = bridge || new DataBridge();
        this.lastMetrics = null;
        this._targetNm = null;

        this.bridge.onMetrics((m) => this._onMetrics(m));
        this.bridge.onBenchmark((b) => {
            if (b && b.retention) this.pulses.setRetentionColors(b.retention);
        });

        if (this._ownsBridge) {
            if (mode === 'live' && wsUrl) this.bridge.startLive(wsUrl);
            else this.bridge.startSimulated();
        }
    }

    _onMetrics(metrics) {
        this.lastMetrics = metrics;
        this.regions.setFiringRates(metrics.firingRates);
        this.pulses.setFiringRates(metrics.firingRates);
        this.pulses.setNeuromodulation(metrics.neuromodulation);
        this._targetNm = metrics.neuromodulation || null;
    }

    /** Latest raw neuromodulation from the data feed (or null). */
    get neuromodulation() {
        return this._targetNm;
    }

    /**
     * Load the cinematic layer: anatomical glass shell + volumetric GPU
     * point cloud, both INSIDE this.group so setScale/setDim keep working
     * for the reveal shrink. Kicked by BrainStage on an idle callback after
     * first paint; the classic procedural look renders until it resolves.
     *
     * @param {Object} opts
     *   url               GLB path (default '/models/brain.glb', draco).
     *   dracoDecoderPath  decoder dir (default '/draco/').
     *   pointCloud        BrainPointCloud opts from the quality tier
     *                     ({surfaceCount, fillTotal, pixelRatio}).
     */
    loadCinematic({ url = '/models/brain.glb', dracoDecoderPath = '/draco/', pointCloud = {} } = {}) {
        if (this._cinematicLoading) return this._cinematicLoading;
        this._cinematicLoading = (async () => {
            // Shell frame + point positions bake the group's CURRENT world
            // transform, so build at scale 1 even if a deep link already
            // shrank the brain (the reveal only ever touches scale).
            const savedScale = this.group.scale.x;
            this.group.scale.setScalar(1);
            try {
                this.shell = new BrainShell(this.group, null);
                const mesh = await this.shell.load(url, { dracoDecoderPath });

                // Anatomical anchors on the real mesh: labels, synapse
                // endpoints, and neuron->region assignment follow the GLB
                // anatomy instead of the midline schematic.
                const anatomy = this.shell.buildAnatomyCenters(REGION_ANATOMY, REGIONS);
                for (const region of REGIONS) {
                    const a = anatomy[region.id];
                    if (!a) continue;
                    this.regions.setBilateralCenter(region.id, a.cloud[0], a.cloud[1] || a.cloud[0]);
                }

                // Curved fiber-tract arcs hugging the inside of the shell,
                // one tube per hemisphere, reconnected to the new anchors.
                this.pulses.lateralSpread = 0;
                this.pulses.radialArcScale = 0.45;
                this.pulses.rebuild();

                // The GLB shell replaces the procedural hull; the point
                // cloud replaces the instanced-sphere clouds.
                this.regions.setHullVisible(false);
                this.pointCloud = new BrainPointCloud(this.group, { ...pointCloud, centers: anatomy });
                this.pointCloud.build(mesh);
                this.regions.setCloudVisible(false);

                this._cloudBase = {
                    bright: this.pointCloud.material.uniforms.uBright.value,
                    alpha: this.pointCloud.material.uniforms.uAlpha.value,
                    shellOpacity: this.shell.material.opacity,
                };
                this.setDim(this._dim);
                return mesh;
            } finally {
                this.group.scale.setScalar(savedScale);
            }
        })();
        return this._cinematicLoading;
    }

    update(dt) {
        this.regions.update(dt);
        this.pulses.update(dt);
        if (this.shell) this.shell.update(dt);
        if (this.pointCloud) {
            // regionData is refreshed by regions.update() earlier this frame.
            this.pointCloud.setFiringData(this.regions.regionData);
            this.pointCloud.update(dt);
        }
    }

    /** Dim factor 0 (full) .. 1 (hidden) across regions + pathways. */
    setDim(factor) {
        this._dim = factor;
        this.regions.setDim(factor);
        this.pulses.setDim(factor);
        if (this._cloudBase) {
            // regions.setDim re-shows the classic instanced clouds at low
            // factors; in cinematic mode they stay replaced by the point cloud.
            this.regions.setCloudVisible(false);
            const u = this.pointCloud.material.uniforms;
            u.uBright.value = this._cloudBase.bright * (1 - factor * 0.96);
            u.uAlpha.value = this._cloudBase.alpha * (1 - factor * 0.96);
            this.shell.material.opacity = this._cloudBase.shellOpacity * (1 - factor * 0.9);
        }
    }

    /** Uniform scale on the whole brain group. */
    setScale(s) {
        this.group.scale.setScalar(s);
    }

    /**
     * Region center by display label or id, in WORLD space (respects group
     * transform). Returns null if unknown. Use for camera focus glides.
     */
    getRegionCenter(labelOrId) {
        if (!labelOrId) return null;
        const needle = String(labelOrId).toLowerCase();
        const region = REGIONS.find(
            (r) => r.id === labelOrId || r.label.toLowerCase() === needle,
        );
        if (!region) return null;
        const local = this.regions.getCenter(region.id);
        if (!local) return null;
        return this.group.localToWorld(local.clone());
    }

    dispose() {
        this.regions.dispose();
        this.pulses.dispose();
        this.pointCloud?.dispose();
        this.shell?.dispose();
        if (this._ownsBridge) this.bridge.dispose();
        if (this.group.parent) this.group.parent.remove(this.group);
    }
}
