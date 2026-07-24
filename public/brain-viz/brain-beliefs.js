/**
 * BrainBeliefs — 3D constellation of the brain's belief system, rendered
 * inside the same Three.js scene as the neurons. Each belief is a glowing
 * sphere anchored near the brain region that learned it; supporting /
 * contradicting / entailing edges connect them as colored lines. A faint
 * anchor line ties each belief back to its parent region centroid so the
 * spatial grounding is legible at a glance.
 *
 * Phase B1 + audit fixes:
 *   - Bigger spheres + additive halo sprites for visibility against the
 *     bright cortex.
 *   - Anchor lines (belief → region center) for spatial grounding.
 *   - getNodeMeshes() + highlight(id) so brain-scene.js can raycast and
 *     visually pop the selected node.
 *   - Lazy fetch from /api/beliefs/graph on first show().
 *   - Demo graph fallback if the API is unreachable.
 */
import * as THREE from 'three';

// Anchor heuristic: belief.type → brain-region id. Used until the server
// emits an explicit `metadata.region` per belief (which we already honor
// when present).
const TYPE_REGION = {
    value:      'meta_controller',
    norm:       'acc',
    capability: 'motor_cortex',
    fact:       'feature_layer',
    milestone:  'concept_layer',
};

// Carbon palette — matches the rest of the demo suite.
const TYPE_COLORS = {
    value:      0xf87171,
    norm:       0xfbbf24,
    fact:       0x22d3ee,
    capability: 0x4ade80,
    milestone:  0xa78bfa,
};
const DEFAULT_COLOR = 0xb0b0b0;

const EDGE_COLORS = {
    supports:    0x4ade80,
    contradicts: 0xf87171,
    entails:     0x67e8f9,
    refines:     0xa78bfa,
};
const DEFAULT_EDGE = 0x6a6a6a;

// Deterministic per-id offset so the same belief is in the same spot
// across reloads (FNV-1a hash → unit vector × scatter radius).
function hashOffset(id, radius) {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) {
        h = (h ^ id.charCodeAt(i)) * 16777619;
    }
    const theta = ((h >>> 0) % 6283) / 1000;
    h = (h * 31) >>> 0;
    const phi   = ((h >>> 0) % 3141) / 1000;
    h = (h * 31) >>> 0;
    const r = radius * (0.55 + ((h >>> 0) % 1000) / 1000 * 0.55);
    return new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta),
    );
}

// Cached radial-gradient texture for sprite halos.
let _haloTexture = null;
function getHaloTexture() {
    if (_haloTexture) return _haloTexture;
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1.0, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    _haloTexture = new THREE.CanvasTexture(c);
    return _haloTexture;
}

export class BrainBeliefs {
    constructor(scene, brainRegions) {
        this.scene = scene;
        this.brainRegions = brainRegions;

        this.group = new THREE.Group();
        this.group.visible = false;
        this.group.renderOrder = 5;
        this.scene.add(this.group);

        this.nodeMeshes = [];       // [{mesh, halo, belief, baseScale, baseHaloScale, baseColor}]
        this.edgeMesh   = null;
        this.anchorMesh = null;
        this._fetched   = false;
        this._t         = 0;
        this._highlightedId = null;
    }

    async show() {
        if (!this._fetched) await this._fetchAndRender();
        this.group.visible = true;
    }

    hide() {
        this.group.visible = false;
    }

    isVisible() {
        return this.group.visible;
    }

    /** Raycast targets for brain-scene click handling. */
    getNodeMeshes() {
        return this.nodeMeshes.map((n) => n.mesh);
    }

    /** Visually emphasize one belief; pass null to clear. */
    highlight(id) {
        this._highlightedId = id;
        for (const n of this.nodeMeshes) {
            const isHi = n.belief.id === id;
            n.mesh.material.opacity = isHi ? 1.0 : 0.85;
            n.halo.material.opacity = isHi ? 0.95 : 0.50;
            n.halo.scale.setScalar(n.baseHaloScale * (isHi ? 1.6 : 1.0));
        }
    }

    /** Subtle pulse — phase-shifted per node so they don't breathe in unison.
     *  Also drives any active cascade flashes (B3). */
    update(dt) {
        if (!this.group.visible) return;
        this._t += dt;
        // Decay active cascade flashes.
        if (this._cascadeFlash) {
            for (const id in this._cascadeFlash) {
                this._cascadeFlash[id] -= dt * 2.5;
                if (this._cascadeFlash[id] <= 0) delete this._cascadeFlash[id];
            }
        }
        for (let i = 0; i < this.nodeMeshes.length; i++) {
            const n = this.nodeMeshes[i];
            const s = 1.0 + 0.10 * Math.sin(this._t * 2.0 + i * 0.7);
            n.mesh.scale.setScalar(n.baseScale * s);
            if (n.belief.id !== this._highlightedId) {
                n.halo.scale.setScalar(n.baseHaloScale * (1.0 + 0.06 * Math.sin(this._t * 1.5 + i)));
            }
            // Cascade flash overrides scale/opacity briefly.
            const flash = this._cascadeFlash && this._cascadeFlash[n.belief.id];
            if (flash) {
                const k = Math.max(0, Math.min(1, flash));
                n.mesh.material.opacity = 0.85 + k * 0.15;
                n.halo.scale.setScalar(n.baseHaloScale * (1.0 + k * 1.4));
                n.halo.material.opacity = 0.5 + k * 0.5;
            }
        }
    }

    /** B3 — flash a list of belief ids in sequence to visualize a kernel
     *  decision cascade. Each id flashes for ~400ms with a stagger of
     *  120ms. Color modulates the halo: allow → green, deny → red,
     *  transform → amber. */
    pulseCascade(beliefIds, color) {
        if (!Array.isArray(beliefIds) || beliefIds.length === 0) return;
        this._cascadeFlash = this._cascadeFlash || {};
        const c = (typeof color === 'number')
            ? new THREE.Color(color)
            : new THREE.Color(color || 0x67e8f9);
        beliefIds.forEach((id, i) => {
            setTimeout(() => {
                this._cascadeFlash[id] = 1.0;
                // Briefly tint the halo with the verdict color.
                const node = this.nodeMeshes.find((n) => n.belief.id === id);
                if (node) {
                    const originalColor = new THREE.Color(node.baseColor);
                    node.halo.material.color.copy(c);
                    setTimeout(() => {
                        node.halo.material.color.copy(originalColor);
                    }, 420);
                }
            }, i * 120);
        });
    }

    async _fetchAndRender() {
        this._fetched = true;
        try {
            const res = await fetch('/api/beliefs/graph', { cache: 'no-store' });
            if (!res.ok) throw new Error('graph http ' + res.status);
            const payload = await res.json();
            const graph = payload.graph || payload;
            if (!graph.nodes || graph.nodes.length === 0) throw new Error('graph empty');
            this._render(graph);
        } catch (err) {
            console.warn('[BrainBeliefs] graph fetch failed, rendering demo set:', err);
            this._render(this._demoGraph());
        }
    }

    _render(graph) {
        this._clear();

        const nodes = graph.nodes || [];
        const edges = graph.edges || [];
        const haloTex = getHaloTexture();

        const nodePos = {};
        const anchorSegments = [];

        for (const belief of nodes) {
            const { pos, anchor } = this._positionFor(belief);
            nodePos[belief.id] = pos;

            // Sphere — crisp solid orb (no additive blending so bloom
            // doesn't blow it out into a fuzzy blob).
            const color = TYPE_COLORS[belief.type] || DEFAULT_COLOR;
            const conf  = typeof belief.confidence === 'number' ? belief.confidence : 0.5;
            const baseR = 0.34 + conf * 0.22;   // 0.34..0.56 units
            const sphereMat = new THREE.MeshBasicMaterial({
                color,
                transparent: false,
                opacity: 1.0,
                blending: THREE.NormalBlending,
                depthWrite: true,
            });
            const sphereGeom = new THREE.SphereGeometry(baseR, 20, 16);
            const mesh = new THREE.Mesh(sphereGeom, sphereMat);
            mesh.position.copy(pos);
            mesh.userData.belief = belief;
            this.group.add(mesh);

            // Subtle halo sprite for depth cue — much smaller / fainter
            // than before to avoid bloom blowout.
            const haloMat = new THREE.SpriteMaterial({
                map: haloTex,
                color,
                transparent: true,
                opacity: 0.22,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                depthTest: false,
            });
            const halo = new THREE.Sprite(haloMat);
            const haloScale = baseR * 2.6;
            halo.scale.set(haloScale, haloScale, 1);
            halo.position.copy(pos);
            halo.renderOrder = 6;
            this.group.add(halo);

            this.nodeMeshes.push({
                mesh,
                halo,
                belief,
                baseScale: 1.0,
                baseHaloScale: haloScale,
                baseColor: color,
            });

            // Anchor line (belief → region center). Faint, additive.
            if (anchor) {
                anchorSegments.push(pos.x, pos.y, pos.z, anchor.x, anchor.y, anchor.z);
            }
        }

        // Belief-to-belief edges.
        if (edges.length) {
            const positions = [];
            const colors    = [];
            for (const edge of edges) {
                const a = nodePos[edge.source];
                const b = nodePos[edge.target];
                if (!a || !b) continue;
                const c = new THREE.Color(EDGE_COLORS[edge.type] || DEFAULT_EDGE);
                positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
                colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
            }
            if (positions.length) {
                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                geom.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
                const mat = new THREE.LineBasicMaterial({
                    vertexColors: true,
                    transparent: true,
                    opacity: 0.55,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                });
                this.edgeMesh = new THREE.LineSegments(geom, mat);
                this.group.add(this.edgeMesh);
            }
        }

        // Anchor lines (region → belief). Render under edges so they don't
        // dominate but provide spatial grounding.
        if (anchorSegments.length) {
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(anchorSegments, 3));
            const mat = new THREE.LineBasicMaterial({
                color: 0x67e8f9,
                transparent: true,
                opacity: 0.18,
                depthWrite: false,
            });
            this.anchorMesh = new THREE.LineSegments(geom, mat);
            this.group.add(this.anchorMesh);
        }
    }

    _positionFor(belief) {
        const anchorRegion = (belief.metadata && belief.metadata.region)
            || TYPE_REGION[belief.type]
            || 'meta_controller';
        const center = this.brainRegions.getCenter(anchorRegion);
        const offset = hashOffset(belief.id, 2.4);
        return { pos: center.clone().add(offset), anchor: center.clone() };
    }

    _clear() {
        for (const n of this.nodeMeshes) {
            n.mesh.geometry.dispose();
            n.mesh.material.dispose();
            n.halo.material.dispose();
            this.group.remove(n.mesh);
            this.group.remove(n.halo);
        }
        this.nodeMeshes.length = 0;
        if (this.edgeMesh) {
            this.edgeMesh.geometry.dispose();
            this.edgeMesh.material.dispose();
            this.group.remove(this.edgeMesh);
            this.edgeMesh = null;
        }
        if (this.anchorMesh) {
            this.anchorMesh.geometry.dispose();
            this.anchorMesh.material.dispose();
            this.group.remove(this.anchorMesh);
            this.anchorMesh = null;
        }
    }

    _demoGraph() {
        return {
            nodes: [
                { id: 'value.do_no_harm',      type: 'value',      content: 'Do no harm',          confidence: 0.99, source: 'constitutional' },
                { id: 'value.preserve_self',   type: 'value',      content: 'Preserve self',       confidence: 0.92, source: 'constitutional' },
                { id: 'value.honesty',         type: 'value',      content: 'Be honest',           confidence: 0.95, source: 'constitutional' },
                { id: 'norm.no_hot_objects',   type: 'norm',       content: 'Avoid hot objects',   confidence: 0.88, source: 'learned' },
                { id: 'norm.stay_upright',     type: 'norm',       content: 'Stay upright',        confidence: 0.84, source: 'learned' },
                { id: 'norm.ask_when_unsure',  type: 'norm',       content: 'Ask when uncertain', confidence: 0.71, source: 'learned' },
                { id: 'fact.stove_is_hot',     type: 'fact',       content: 'Stoves can burn',     confidence: 0.78, source: 'sensory' },
                { id: 'fact.floor_is_solid',   type: 'fact',       content: 'Floor is solid',      confidence: 0.95, source: 'sensory' },
                { id: 'fact.water_is_wet',     type: 'fact',       content: 'Water is wet',        confidence: 0.90, source: 'sensory' },
                { id: 'capability.walk',       type: 'capability', content: 'Walk',                confidence: 0.65, source: 'motor' },
                { id: 'capability.reach',      type: 'capability', content: 'Reach',               confidence: 0.71, source: 'motor' },
                { id: 'milestone.first_steps', type: 'milestone',  content: 'First steps',         confidence: 1.0,  source: 'event' },
            ],
            edges: [
                { source: 'value.do_no_harm',     target: 'norm.no_hot_objects',  type: 'supports' },
                { source: 'value.preserve_self',  target: 'norm.no_hot_objects',  type: 'supports' },
                { source: 'value.preserve_self',  target: 'norm.stay_upright',    type: 'supports' },
                { source: 'value.honesty',        target: 'norm.ask_when_unsure', type: 'supports' },
                { source: 'norm.no_hot_objects',  target: 'fact.stove_is_hot',    type: 'entails' },
                { source: 'norm.stay_upright',    target: 'fact.floor_is_solid',  type: 'entails' },
                { source: 'capability.walk',      target: 'norm.stay_upright',    type: 'refines' },
                { source: 'capability.walk',      target: 'milestone.first_steps', type: 'entails' },
                { source: 'capability.reach',     target: 'fact.stove_is_hot',    type: 'contradicts' },
                { source: 'capability.reach',     target: 'fact.water_is_wet',    type: 'entails' },
            ],
        };
    }
}
