/**
 * body-scene.js — Three.js body scene (dynamic, body-aware).
 *
 * Renders any MuJoCo body (pendulum, arm, walker, humanoid) by
 * building Three.js meshes from live geometry data.  Falls back to
 * the detailed procedural humanoid when geometry is unavailable.
 *
 * Usage:
 *   import { BodyScene } from './body-scene.js';
 *   const scene = new BodyScene(containerEl);
 *   scene.updateBodies(bodiesArray, channel, success, geomsArray);
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ── Materials ──────────────────────────────────────────────────
const _white   = () => new THREE.MeshStandardMaterial({ color: 0xdce0e6, roughness: 0.35, metalness: 0.10 });
const _darkGrey = () => new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.45, metalness: 0.25 });
const _midGrey  = () => new THREE.MeshStandardMaterial({ color: 0x44484f, roughness: 0.40, metalness: 0.30 });
const _joint    = () => new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.30, metalness: 0.60 });
const _accent   = () => new THREE.MeshStandardMaterial({ color: 0x3a7bd5, roughness: 0.25, metalness: 0.40, emissive: 0x1a3a6a, emissiveIntensity: 0.15 });
const _eye      = () => new THREE.MeshStandardMaterial({ color: 0x44aaff, roughness: 0.1, metalness: 0.3, emissive: 0x2288ff, emissiveIntensity: 0.8 });
const _visor    = () => new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.15, metalness: 0.60, transparent: true, opacity: 0.85 });

// Channel → highlight color mapping
const CHANNEL_COLORS = {
    locomotion:   new THREE.Color(0x22aaff),
    manipulation: new THREE.Color(0x38d97a),
    head:         new THREE.Color(0xf5c842),
    speech:       new THREE.Color(0xf472b6),
    expression:   new THREE.Color(0xa673f5),
    cognitive:    new THREE.Color(0x22d3ee),
};

// Which bodies belong to each channel (humanoid layout, used when available)
const CHANNEL_BODIES = {
    locomotion:   [
        'pelvis', 'lower_torso',
        'r_hip_link', 'r_thigh', 'r_shin', 'r_foot',
        'l_hip_link', 'l_thigh', 'l_shin', 'l_foot',
    ],
    manipulation: [
        'r_shoulder_link', 'r_upper_arm', 'r_forearm', 'r_hand',
        'l_shoulder_link', 'l_upper_arm', 'l_forearm', 'l_hand',
    ],
    head: ['neck_base', 'head'],
};

// ── Procedural robot body part builders (humanoid) ───────────
// Each function returns a THREE.Group with child meshes.

function _jointRing(radius, width) {
    const geo = new THREE.TorusGeometry(radius, width, 8, 24);
    const mesh = new THREE.Mesh(geo, _joint());
    mesh.rotation.x = Math.PI / 2;
    return mesh;
}

function _jointDisc(radius) {
    const geo = new THREE.CylinderGeometry(radius, radius, 0.015, 24);
    return new THREE.Mesh(geo, _joint());
}

function buildPelvis() {
    const g = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.10, 0.16), _darkGrey());
    g.add(plate);
    for (const s of [-1, 1]) {
        const cover = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, 0.13), _midGrey());
        cover.position.set(s * 0.12, -0.005, 0);
        g.add(cover);
    }
    return g;
}

function buildLowerTorso() {
    const g = new THREE.Group();
    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.11, 0.14, 16), _darkGrey());
    g.add(waist);
    g.add(_jointRing(0.105, 0.008));
    return g;
}

function buildTorso() {
    const g = new THREE.Group();
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.14), _white());
    g.add(chest);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.18, 0.145), _accent());
    g.add(line);
    for (const s of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.20, 0.12), _darkGrey());
        side.position.set(s * 0.13, 0, 0);
        g.add(side);
    }
    return g;
}

function buildNeckBase() {
    const g = new THREE.Group();
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.06, 12), _darkGrey());
    g.add(neck);
    g.add(_jointRing(0.04, 0.006));
    return g;
}

function buildHead() {
    const g = new THREE.Group();
    const skull = new THREE.Mesh(
        new THREE.SphereGeometry(0.095, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.75), _white());
    skull.position.y = 0.02;
    g.add(skull);
    const visor = new THREE.Mesh(
        new THREE.SphereGeometry(0.088, 20, 8, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.15, Math.PI * 0.35), _visor());
    visor.position.set(0, 0.02, 0);
    visor.rotation.y = Math.PI;
    g.add(visor);
    for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), _eye());
        eye.position.set(s * 0.032, 0.03, -0.075);
        g.add(eye);
    }
    const chin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.04), _midGrey());
    chin.position.set(0, -0.05, -0.04);
    g.add(chin);
    return g;
}

function buildShoulderLink() {
    const g = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.05, 16), _joint());
    housing.rotation.z = Math.PI / 2;
    g.add(housing);
    const disc = _jointDisc(0.045);
    disc.rotation.z = Math.PI / 2;
    g.add(disc);
    return g;
}

function buildUpperArm() {
    const g = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.033, 0.24, 8), _white());
    arm.position.y = -0.12;
    g.add(arm);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.22, 0.065), _darkGrey());
    stripe.position.set(0, -0.12, 0);
    g.add(stripe);
    const elbow = _jointDisc(0.035);
    elbow.position.y = -0.24;
    g.add(elbow);
    return g;
}

function buildForearm() {
    const g = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.22, 8), _white());
    arm.position.y = -0.11;
    g.add(arm);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.20, 0.055), _darkGrey());
    stripe.position.set(0, -0.11, 0);
    g.add(stripe);
    g.add(_jointRing(0.03, 0.005));
    const wr = g.children[g.children.length - 1];
    wr.position.y = -0.22;
    wr.rotation.x = Math.PI / 2;
    return g;
}

function buildHand() {
    const g = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.025), _darkGrey());
    g.add(palm);
    for (const x of [-0.018, 0, 0.018]) {
        const finger = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.045, 0.018), _midGrey());
        finger.position.set(x, -0.06, 0);
        g.add(finger);
    }
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.035, 0.018), _midGrey());
    thumb.position.set(0.035, -0.02, 0);
    thumb.rotation.z = -0.5;
    g.add(thumb);
    return g;
}

function buildHipLink() {
    const g = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.04, 16), _joint());
    g.add(housing);
    const ring = _jointDisc(0.05);
    ring.position.y = 0.02;
    g.add(ring);
    return g;
}

function buildThigh() {
    const g = new THREE.Group();
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.34, 8), _white());
    thigh.position.y = -0.17;
    g.add(thigh);
    const channel = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.32, 0.09), _darkGrey());
    channel.position.set(0, -0.17, 0);
    g.add(channel);
    const knee = _jointDisc(0.043);
    knee.position.y = -0.34;
    g.add(knee);
    return g;
}

function buildShin() {
    const g = new THREE.Group();
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.035, 0.32, 8), _white());
    shin.position.y = -0.16;
    g.add(shin);
    const channel = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.30, 0.07), _darkGrey());
    channel.position.set(0, -0.16, 0);
    g.add(channel);
    const ankle = _jointRing(0.033, 0.005);
    ankle.position.y = -0.32;
    ankle.rotation.x = Math.PI / 2;
    g.add(ankle);
    return g;
}

function buildFoot() {
    const g = new THREE.Group();
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.03, 0.10), _darkGrey());
    foot.position.set(0, 0, -0.015);
    g.add(foot);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.095), _midGrey());
    sole.position.set(0, -0.015, -0.015);
    g.add(sole);
    return g;
}

// Map body names to procedural builder functions (humanoid only)
const BODY_BUILDERS = {
    'pelvis':          buildPelvis,
    'lower_torso':     buildLowerTorso,
    'torso':           buildTorso,
    'neck_base':       buildNeckBase,
    'head':            buildHead,
    'r_shoulder_link': buildShoulderLink,
    'r_upper_arm':     buildUpperArm,
    'r_forearm':       buildForearm,
    'r_hand':          buildHand,
    'l_shoulder_link': buildShoulderLink,
    'l_upper_arm':     buildUpperArm,
    'l_forearm':       buildForearm,
    'l_hand':          buildHand,
    'r_hip_link':      buildHipLink,
    'r_thigh':         buildThigh,
    'r_shin':          buildShin,
    'r_foot':          buildFoot,
    'l_hip_link':      buildHipLink,
    'l_thigh':         buildThigh,
    'l_shin':          buildShin,
    'l_foot':          buildFoot,
};

// ── Dynamic geometry builder ─────────────────────────────────

/**
 * Build a Three.js group from a MuJoCo geom definition.
 * @param {{ type: string, size: number[], rgba: number[] }} geom
 */
function _buildGeomMesh(geom) {
    const g = new THREE.Group();
    const [r, gg, b, a] = geom.rgba || [0.5, 0.5, 0.5, 1];
    const color = new THREE.Color(r, gg, b);
    const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.30,
        transparent: a < 1,
        opacity: a,
    });

    let mesh;
    switch (geom.type) {
        case 'capsule': {
            const radius = geom.size[0] || 0.03;
            const halflen = geom.size[1] || 0.1;
            mesh = new THREE.Mesh(
                new THREE.CapsuleGeometry(radius, halflen * 2, 8, 16),
                mat,
            );
            break;
        }
        case 'sphere': {
            const radius = geom.size[0] || 0.05;
            mesh = new THREE.Mesh(
                new THREE.SphereGeometry(radius, 16, 12),
                mat,
            );
            break;
        }
        case 'box': {
            const hx = geom.size[0] || 0.05;
            const hy = geom.size[1] || 0.05;
            const hz = geom.size[2] || 0.05;
            mesh = new THREE.Mesh(
                new THREE.BoxGeometry(hx * 2, hz * 2, hy * 2),
                mat,
            );
            break;
        }
        case 'ellipsoid': {
            // MuJoCo ellipsoid: size = [rx, ry, rz] (semi-axes)
            // For pendulum rod: size=[0.02, 0.3, 0] means rx=0.02, ry=0.3
            const rx = geom.size[0] || 0.03;
            const ry = geom.size[1] || 0.03;
            const rz = geom.size[2] || rx;
            // Use a sphere scaled to ellipsoid proportions
            mesh = new THREE.Mesh(
                new THREE.SphereGeometry(1, 16, 12),
                mat,
            );
            mesh.scale.set(rx, rz || rx, ry);  // Three.js Y=up, MuJoCo Z=up
            break;
        }
        case 'cylinder': {
            const radius = geom.size[0] || 0.03;
            const halflen = geom.size[1] || 0.1;
            mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(radius, radius, halflen * 2, 16),
                mat,
            );
            break;
        }
        case 'plane':
            return null;  // skip ground planes, we have our own
        default: {
            // Unknown type: render as small sphere
            mesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.03, 8, 6),
                mat,
            );
        }
    }
    if (mesh) g.add(mesh);
    return g;
}

// ── Helpers ──────────────────────────────────────────────────

function _setsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
}

// ── Scene class ───────────────────────────────────────────────

export class BodyScene {
    constructor(container) {
        this._container = container;
        this._meshes = {};          // body name → THREE.Group
        this._baseMaterials = {};   // body name → [MeshStandardMaterial, ...]
        this._origEmissive = new Map(); // mat → { color: Color, intensity: number }
        this._activeChannel = null;
        this._animId = null;
        this._cameraTarget = new THREE.Vector3(0, 0.75, 0);
        this._currentBodySet = null;  // Set of body names currently built
        this._isHumanoid = false;     // true when using procedural humanoid builders

        this._initRenderer();
        this._initCamera();
        this._initScene();
        this._initControls();
        this._onResize = this._handleResize.bind(this);
        window.addEventListener('resize', this._onResize);
        this._animate();
    }

    // ── Setup ────────────────────────────────────────────────────

    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(this._container.clientWidth, this._container.clientHeight);
        this.renderer.setClearColor(0x0a0e1a, 1);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.8;
        this._container.appendChild(this.renderer.domElement);
    }

    _initCamera() {
        const w = this._container.clientWidth;
        const h = this._container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(40, w / h, 0.05, 50);
        this.camera.position.set(1.0, 1.1, -2.0);
        this.camera.lookAt(0, 0.75, 0);
    }

    _initScene() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x0a0e1a, 0.04);

        const ambient = new THREE.AmbientLight(0x556677, 1.0);
        this.scene.add(ambient);

        const key = new THREE.DirectionalLight(0xfff5e6, 1.6);
        key.position.set(3, 6, -4);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.camera.near = 0.5;
        key.shadow.camera.far = 20;
        key.shadow.camera.left = -3;
        key.shadow.camera.right = 3;
        key.shadow.camera.top = 4;
        key.shadow.camera.bottom = -2;
        key.shadow.bias = -0.0005;
        this.scene.add(key);

        const fill = new THREE.DirectionalLight(0x6688cc, 0.5);
        fill.position.set(-3, 4, 2);
        this.scene.add(fill);

        const rim = new THREE.DirectionalLight(0x88aaee, 0.4);
        rim.position.set(0, 2, 4);
        this.scene.add(rim);

        const grid = new THREE.GridHelper(10, 30, 0x1a2a3a, 0x0f1520);
        this.scene.add(grid);

        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(10, 10),
            new THREE.ShadowMaterial({ opacity: 0.4 }),
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    _initControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 0.75, 0);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 0.8;
        this.controls.maxDistance = 8;
        this.controls.update();
    }

    // ── Build meshes ──────────────────────────────────────────────

    /**
     * Called once with static geometry from /api/mujoco/model.
     * With dynamic body awareness, this is now a no-op - meshes
     * are built on first updateBodies() call using live geometry.
     */
    setModelGeometry(_geoms) {
        // Intentional no-op: meshes are built dynamically in updateBodies()
    }

    _clearMeshes() {
        for (const m of Object.values(this._meshes)) {
            this.scene.remove(m);
        }
        this._meshes = {};
        this._baseMaterials = {};
        this._origEmissive.clear();
        this._currentBodySet = null;
        this._isHumanoid = false;
    }

    _addMesh(name, group) {
        group.castShadow = true;
        group.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        this.scene.add(group);
        this._meshes[name] = group;

        const mats = [];
        group.traverse(child => {
            if (child.isMesh && child.material) {
                mats.push(child.material);
                const m = child.material;
                if (m.emissive) {
                    this._origEmissive.set(m, {
                        color: m.emissive.clone(),
                        intensity: m.emissiveIntensity,
                    });
                }
            }
        });
        this._baseMaterials[name] = mats;
    }

    /**
     * Rebuild all meshes for a new set of bodies.
     * Uses procedural humanoid builders when all names are in BODY_BUILDERS,
     * otherwise builds from MuJoCo geometry data.
     */
    _rebuildForBodies(bodyNames, geoms) {
        this._clearMeshes();
        this._geomCentric = false;

        // Check if this is a humanoid (all names have procedural builders)
        const allHumanoid = [...bodyNames].every(n => BODY_BUILDERS[n]);

        if (allHumanoid && bodyNames.size >= 15) {
            // Use detailed procedural humanoid
            this._isHumanoid = true;
            for (const name of bodyNames) {
                const builder = BODY_BUILDERS[name];
                // Builders author geometry in the pre-2026-07-24 (v2) body
                // frame: lateral = local X, face = local -Z. The v3 MJCF
                // (oscen_humanoid_v3) re-attached limbs so MuJoCo X = forward
                // and Y = lateral; after the MuJoCo->Three (x,z,-y) basis swap
                // that means lateral = Three Z and forward = Three +X. Wrap
                // each part in a -90deg yaw so the authored geometry lands in
                // the v3 frame (old +X lateral -> Three +Z = v3 right side,
                // old -Z face -> Three +X forward). World xquat from the sim
                // applies to the outer group, untouched.
                const outer = new THREE.Group();
                const inner = builder();
                inner.rotation.y = -Math.PI / 2;
                outer.add(inner);
                this._addMesh(name, outer);
            }
        } else if (geoms && geoms.length > 0) {
            // Geom-centric rendering: one mesh per geom, positioned at geom
            // world-space xpos (not body xpos). This handles geoms with local
            // offsets within their body frame correctly.
            this._geomCentric = true;
            this._isHumanoid = false;

            for (let i = 0; i < geoms.length; i++) {
                const g = geoms[i];
                if (g.type === 'plane') continue;
                if ((g.body || 'world') === 'world') continue;
                const built = _buildGeomMesh(g);
                if (built) {
                    this._addMesh(`geom_${i}`, built);
                }
            }
        } else {
            // No geometry data: build generic colored shapes
            const colors = [0x3a7bd5, 0x38d97a, 0xf5c842, 0xf472b6, 0xa673f5, 0x22d3ee];
            let ci = 0;
            for (const name of bodyNames) {
                const group = new THREE.Group();
                const color = colors[ci % colors.length];
                ci++;
                const mat = new THREE.MeshStandardMaterial({
                    color, roughness: 0.35, metalness: 0.30,
                });
                const mesh = new THREE.Mesh(
                    new THREE.CapsuleGeometry(0.03, 0.1, 8, 12),
                    mat,
                );
                group.add(mesh);
                this._addMesh(name, group);
            }
        }

        this._currentBodySet = new Set(bodyNames);
    }

    // ── Update body transforms from live data ────────────────────

    updateBodies(bodies, activeChannel, success, geoms) {
        if (!bodies || bodies.length === 0) return;
        this._activeChannel = activeChannel;

        // Filter out 'world' body
        const nonWorld = bodies.filter(b => b.name !== 'world');
        const incomingNames = new Set(nonWorld.map(b => b.name));

        // Auto-rebuild if body set changed
        if (!this._currentBodySet || !_setsEqual(incomingNames, this._currentBodySet)) {
            this._rebuildForBodies(incomingNames, geoms);
        }

        // Find root body height for camera tracking (highest initial body)
        let rootZ = 0;
        for (const b of nonWorld) {
            if (b.xpos[2] > rootZ) rootZ = b.xpos[2];
        }

        // Clamp display height
        const MAX_DISPLAY_HEIGHT = 3.0;
        const yOffset = rootZ > MAX_DISPLAY_HEIGHT ? rootZ - 1.0 : 0;

        if (this._geomCentric && geoms && geoms.length > 0) {
            // Position each geom mesh at its world-space xpos
            for (let i = 0; i < geoms.length; i++) {
                const mesh = this._meshes[`geom_${i}`];
                if (!mesh) continue;
                const g = geoms[i];
                if (!g.xpos) continue;

                // MuJoCo xpos → Three.js (swap Y/Z)
                mesh.position.set(g.xpos[0], g.xpos[2] - yOffset, -g.xpos[1]);

                // MuJoCo xmat (3x3 row-major flat [9]) → Three.js rotation
                if (g.xmat && g.xmat.length === 9) {
                    const m = g.xmat;
                    // MuJoCo row-major: [r00,r01,r02, r10,r11,r12, r20,r21,r22]
                    // Coordinate swap: MuJoCo(X,Y,Z) → Three(X,Z,-Y)
                    const mat4 = new THREE.Matrix4();
                    mat4.set(
                        m[0],  m[2], -m[1], 0,
                        m[6],  m[8], -m[7], 0,
                       -m[3], -m[5],  m[4], 0,
                        0,     0,     0,    1,
                    );
                    mesh.quaternion.setFromRotationMatrix(mat4);
                }
            }
        } else {
            // Body-centric positioning (humanoid or fallback)
            for (const b of bodies) {
                const mesh = this._meshes[b.name];
                if (!mesh) continue;

                // MuJoCo xpos → Three.js position (swap Y/Z, negate Y)
                mesh.position.set(b.xpos[0], b.xpos[2] - yOffset, -b.xpos[1]);

                // MuJoCo xquat [w,x,y,z] → Three.js quaternion
                const [w, qx, qy, qz] = b.xquat;
                mesh.quaternion.set(qx, qz, -qy, w);
            }
        }

        // Smooth camera follow
        const clampedY = Math.max(0.3, rootZ - yOffset);
        this._cameraTarget.set(0, clampedY, 0);
        this.controls.target.lerp(this._cameraTarget, 0.08);

        this._highlightChannel(activeChannel, success);
    }

    /**
     * Apply a canned test pose directly in Three.js space (humanoid only).
     */
    applyTestPose(channel, success) {
        if (!this._isHumanoid) return;

        // Three-space canned poses in the v3 frame: forward = +X, lateral =
        // Z (right side = +Z, since v3 right = MuJoCo -Y and Three z = -y).
        // Sagittal swings are rotations about the lateral axis (Three Z),
        // positive = forward.
        const poses = {
            locomotion: {
                r_thigh:  { pos: [0.12, 0.72, 0.09], rot: [0, 0, 0.26, 0.97] },
                r_shin:   { pos: [0.25, 0.36, 0.09], rot: [0, 0, 0.17, 0.98] },
                r_foot:   { pos: [0.28, 0.02, 0.09], rot: [0, 0, 0, 1] },
                l_thigh:  { pos: [-0.08, 0.78, -0.09], rot: [0, 0, -0.13, 0.99] },
                l_shin:   { pos: [-0.12, 0.42, -0.09], rot: [0, 0, -0.09, 1.0] },
                l_foot:   { pos: [-0.10, 0.02, -0.09], rot: [0, 0, 0, 1] },
            },
            manipulation: {
                r_upper_arm: { pos: [0.15, 1.24, 0.22], rot: [0, 0, 0.707, 0.707] },
                r_forearm:   { pos: [0.42, 1.20, 0.24], rot: [0, 0, 0.74, 0.67] },
                r_hand:      { pos: [0.66, 1.16, 0.26], rot: [0, 0, 0.74, 0.67] },
                l_upper_arm: { pos: [0.15, 1.24, -0.22], rot: [0, 0, 0.707, 0.707] },
                l_forearm:   { pos: [0.42, 1.20, -0.24], rot: [0, 0, 0.74, 0.67] },
                l_hand:      { pos: [0.66, 1.16, -0.26], rot: [0, 0, 0.74, 0.67] },
            },
            head: {
                head: { pos: [0.03, 1.45, 0], rot: [0, 0.12, 0.08, 0.99] },
            },
        };

        const pose = poses[channel];
        if (!pose) return;

        for (const [name, t] of Object.entries(pose)) {
            const mesh = this._meshes[name];
            if (!mesh) continue;
            mesh.position.set(t.pos[0], t.pos[1], t.pos[2]);
            mesh.quaternion.set(t.rot[0], t.rot[1], t.rot[2], t.rot[3]).normalize();
        }

        this._highlightChannel(channel, success);
    }

    // H2.1 (2026-06-20): per-channel emissive highlight removed; it
    // obscured the body shape during diagnosis. Reset emissives back to
    // their original values so older saved state doesn't bleed through.
    _highlightChannel(_channel, _success) {
        for (const mats of Object.values(this._baseMaterials)) {
            for (const mat of mats) {
                const orig = this._origEmissive.get(mat);
                if (orig) {
                    mat.emissive.copy(orig.color);
                    mat.emissiveIntensity = orig.intensity;
                } else if (mat.emissive) {
                    mat.emissive.setHex(0x000000);
                    mat.emissiveIntensity = 0;
                }
            }
        }
    }

    /**
     * H2.1 (2026-06-20): continuous per-channel motor activation glow
     * removed -- it tinted the whole body in green/yellow during normal
     * activity and made the body hard to read. Kept as a clearing no-op
     * so existing call sites still wipe any stale emissive state.
     * @param {Object} _rates - { locomotion: 0-1, manipulation: 0-1, head: 0-1 }
     */
    updateMotorActivation(_rates) {
        for (const mats of Object.values(this._baseMaterials)) {
            for (const mat of mats) {
                const orig = this._origEmissive.get(mat);
                if (orig) {
                    mat.emissive.copy(orig.color);
                    mat.emissiveIntensity = orig.intensity;
                } else if (mat.emissive) {
                    mat.emissive.setHex(0x000000);
                    mat.emissiveIntensity = 0;
                }
            }
        }
    }

    // ── Animation loop ───────────────────────────────────────────

    _animate() {
        this._animId = requestAnimationFrame(() => this._animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    _handleResize() {
        const w = this._container.clientWidth;
        const h = this._container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    dispose() {
        window.removeEventListener('resize', this._onResize);
        if (this._animId) cancelAnimationFrame(this._animId);
        this.controls.dispose();
        this.renderer.dispose();
    }
}
