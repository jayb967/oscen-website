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

    update(dt) {
        this.regions.update(dt);
        this.pulses.update(dt);
    }

    /** Dim factor 0 (full) .. 1 (hidden) across regions + pathways. */
    setDim(factor) {
        this.regions.setDim(factor);
        this.pulses.setDim(factor);
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
        if (this._ownsBridge) this.bridge.dispose();
        if (this.group.parent) this.group.parent.remove(this.group);
    }
}
