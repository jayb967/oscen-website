/**
 * Anatomical brain shell for the Cinematic scene.
 *
 * Loads a GLB brain mesh (NIH 3D, public domain), recenters + scales + orients
 * it to sit around the region particle clouds, and renders it as a translucent
 * glass membrane (MeshPhysicalMaterial transmission) lit by the scene's IBL.
 * depthWrite is off so the glowing interior particles show through instead of
 * being occluded by the front glass face.
 *
 * Tunables are grouped at the top -- orientation/scale are dialed in by eye
 * against a screenshot, since the source mesh's axis convention is not known
 * ahead of time.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// Scene brain centroid (matches brain-pulses.js BRAIN_CENTER and the region layout).
const BRAIN_CENTER = new THREE.Vector3(0, 0.5, -0.5);

// --- Tunables (dialed via screenshots) ---------------------------------------
// Target world-space size of the mesh's largest dimension. Regions span ~+-5,
// so ~13 wraps the cloud with a little margin.
const TARGET_MAX_DIM = 13.0;
// Euler rotation (radians) mapping the source MRI axes to our Y-up / +Z-front
// layout. Verified + adjusted against a render.
const ROTATION = [-Math.PI / 2, 0, 0];
// Small manual offset on top of BRAIN_CENTER if the mesh centroid needs nudging.
const OFFSET = [0, 0, 0];

export class BrainShell {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.group = new THREE.Group();
        this.mesh = null;
        this.material = null;
        this.scene.add(this.group);
    }

    /**
     * Load the GLB. Returns a promise resolving to the mesh (or rejecting).
     * Pass `dracoDecoderPath` (e.g. '/draco/') when the asset is
     * draco-compressed; the site ships the compressed brain + decoder.
     */
    load(url, { dracoDecoderPath } = {}) {
        const loader = new GLTFLoader();
        if (dracoDecoderPath) {
            const draco = new DRACOLoader();
            draco.setDecoderPath(dracoDecoderPath);
            loader.setDRACOLoader(draco);
        }
        return new Promise((resolve, reject) => {
            loader.load(
                url,
                (gltf) => {
                    try { this._onLoaded(gltf); resolve(this.mesh); }
                    catch (e) { reject(e); }
                },
                undefined,
                (err) => reject(err),
            );
        });
    }

    _onLoaded(gltf) {
        // First mesh in the file.
        let src = null;
        gltf.scene.traverse((o) => { if (!src && o.isMesh) src = o; });
        if (!src) throw new Error('no mesh in GLB');

        const geo = src.geometry;
        geo.computeVertexNormals();
        geo.computeBoundingBox();
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        geo.boundingBox.getSize(size);
        geo.boundingBox.getCenter(center);

        // Recenter geometry to its own origin so group transforms are clean.
        geo.translate(-center.x, -center.y, -center.z);

        // Translucent glass brain. NOTE: we deliberately do NOT use
        // `transmission` here. MeshPhysicalMaterial transmission renders via a
        // screen-space buffer that only captures OPAQUE geometry, so the glass
        // front face overwrites the additive neuron point cloud behind it --
        // which read as an entire hemisphere going dark when the shell was on
        // (see PROGRESS "Feedback pass 3"). Plain alpha transparency lets the
        // additive interior glow composite through the whole volume, while
        // roughness + clearcoat + the IBL env map keep the wet-glass sheen and a
        // Fresnel rim so it still reads as a glass brain.
        this.material = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(0.72, 0.80, 0.96),
            metalness: 0.0,
            roughness: 0.26,
            transmission: 0.0,
            ior: 1.33,
            clearcoat: 0.6,
            clearcoatRoughness: 0.28,
            envMapIntensity: 1.15,
            transparent: true,
            opacity: 0.22,
            side: THREE.FrontSide,
            depthWrite: false,   // let interior glow show through
            // No depth test: the reveal parks the shell inside the humanoid's
            // depth-writing head; the glass must stay visible through the
            // skull. Elsewhere nothing writes depth, so no visual change.
            depthTest: false,
        });

        this.mesh = new THREE.Mesh(geo, this.material);
        this.mesh.frustumCulled = false;
        // After the figure (0), before the neuron points (2).
        this.mesh.renderOrder = 1;
        this.group.add(this.mesh);

        // Uniform scale so the largest dimension maps to TARGET_MAX_DIM.
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        this.group.scale.setScalar(TARGET_MAX_DIM / maxDim);
        this.group.rotation.set(ROTATION[0], ROTATION[1], ROTATION[2]);
        this.group.position.set(
            BRAIN_CENTER.x + OFFSET[0],
            BRAIN_CENTER.y + OFFSET[1],
            BRAIN_CENTER.z + OFFSET[2],
        );

        // Register the mesh's world-space frame so region anchors can be placed
        // ON the real anatomy (see anatomicalToWorld / buildAnatomyCenters).
        this._registerFrame();
    }

    /**
     * Compute the mesh's world-space bounding box + a decimated set of
     * world-space surface vertices used for snap-to-cortex. Runs once after the
     * transforms above are applied, so it reflects the final placed anatomy.
     *
     * Axis mapping was verified empirically by rendering the placed mesh from
     * each world axis (see PROGRESS "Feedback pass 2"): the anterior face points
     * along +X, superior along +Y, and the left-right (lateral) axis is Z. So
     * anatomical AP -> world X, SI -> world Y, LR -> world Z. (The source MRI's
     * own axis convention plus the ROTATION applied at load leave the brain
     * lying nose-along-X, which is why AP is X, not Z.)
     */
    _registerFrame() {
        this.mesh.updateWorldMatrix(true, false);
        const world = this.mesh.matrixWorld;
        const pos = this.mesh.geometry.getAttribute('position');

        // Decimate for the nearest-surface search (124k verts -> ~1 in STRIDE).
        const STRIDE = 2;
        const n = Math.ceil(pos.count / STRIDE);
        this._surf = new Float32Array(n * 3);
        const box = new THREE.Box3();
        const v = new THREE.Vector3();
        let w = 0;
        for (let i = 0; i < pos.count; i += STRIDE) {
            v.fromBufferAttribute(pos, i).applyMatrix4(world);
            this._surf[w * 3] = v.x;
            this._surf[w * 3 + 1] = v.y;
            this._surf[w * 3 + 2] = v.z;
            box.expandByPoint(v);
            w++;
        }
        this._surfCount = w;
        this.worldBox = box;
        this.worldCenter = box.getCenter(new THREE.Vector3());
        this.worldHalf = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    }

    /**
     * Find the world-space surface vertex nearest to `p`, pulled slightly inward
     * along the direction to the mesh centroid so labels/pulse endpoints sit just
     * under the glass instead of z-fighting the front face.
     */
    _snapToSurface(p) {
        const surf = this._surf;
        let bx = p.x, by = p.y, bz = p.z, bestD = Infinity;
        for (let i = 0; i < this._surfCount; i++) {
            const x = surf[i * 3], y = surf[i * 3 + 1], z = surf[i * 3 + 2];
            const dx = x - p.x, dy = y - p.y, dz = z - p.z;
            const d = dx * dx + dy * dy + dz * dz;
            if (d < bestD) { bestD = d; bx = x; by = y; bz = z; }
        }
        const s = new THREE.Vector3(bx, by, bz);
        s.addScaledVector(new THREE.Vector3().subVectors(this.worldCenter, s).normalize(), 0.35);
        return s;
    }

    /**
     * Map a normalized anatomical coordinate to a world-space point on/in the
     * mesh. ap/si/lr in [-1,1] (see region-anatomy.js). `snap` projects the
     * point onto the nearest cortical surface vertex (for non-deep regions).
     */
    anatomicalToWorld(ap, si, lr, snap = false) {
        const c = this.worldCenter, h = this.worldHalf;
        // AP -> X (anterior +X), SI -> Y (superior +Y), LR -> Z (lateral).
        const p = new THREE.Vector3(
            c.x + ap * h.x,
            c.y + si * h.y,
            c.z + lr * h.z,
        );
        return snap ? this._snapToSurface(p) : p;
    }

    /**
     * Build the per-region anchor map from a REGION_ANATOMY table + region list.
     * Returns { id: { primary: Vector3, cloud: [Vector3, ...] } }:
     *   primary  single anchor for the label + synapse endpoint + getCenter override.
     *   cloud    anchors for neuron->region assignment; bilateral regions get L+R.
     */
    buildAnatomyCenters(anatomy, regions) {
        const out = {};
        for (const region of regions) {
            const a = anatomy[region.id];
            if (!a) continue;
            const snap = !a.deep;
            const primary = this.anatomicalToWorld(a.ap, a.si, a.lr, snap);
            const cloud = [primary];
            if (a.bilateral && Math.abs(a.lr) > 1e-3) {
                cloud.push(this.anatomicalToWorld(a.ap, a.si, -a.lr, snap));
            }
            out[region.id] = { primary, cloud };
        }
        return out;
    }

    /** Runtime tweak helper (used while dialing orientation/scale via console). */
    configure({ rotation, targetMaxDim, offset } = {}) {
        if (rotation) this.group.rotation.set(rotation[0], rotation[1], rotation[2]);
        if (targetMaxDim && this.mesh) {
            this.mesh.geometry.computeBoundingBox();
            const size = new THREE.Vector3();
            this.mesh.geometry.boundingBox.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            this.group.scale.setScalar(targetMaxDim / maxDim);
        }
        if (offset) this.group.position.set(
            BRAIN_CENTER.x + offset[0], BRAIN_CENTER.y + offset[1], BRAIN_CENTER.z + offset[2],
        );
    }

    update(_dt) {
        // Shell is static relative to the particles; the camera auto-orbit
        // rotates the whole scene, so nothing to animate here yet.
    }

    dispose() {
        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.material.dispose();
            this.group.remove(this.mesh);
        }
        this.scene.remove(this.group);
    }
}
