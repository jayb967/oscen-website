/**
 * HumanoidFigure -- the portable android: GLB load + normalization,
 * head-bone lookup, eye glows, idle sway, cursor head-tracking, and the
 * material states, all in one THREE.Group. No renderer, no camera, no
 * DOM (mirrors BrainModule's contract so the reveal scene can mount it
 * into BrainStage's scene next to the brain).
 *
 * Material states:
 *  - 'source'     the GLB's shipped PBR materials (tunable params)
 *  - 'porcelain'  matte ceramic override
 *  - 'xray'       hybrid shader: porcelain-ish lit shading blended into a
 *                 fresnel hologram per-fragment, driven by two uniforms
 *                 (uBodyXray whole-figure, uHeadXray above-the-neck mask).
 *                 The whole reveal runs in this one material so scrubbing
 *                 never swaps materials mid-frame.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const DEFAULTS = {
    height: 1.75,           // world units the model is normalized to
    dracoPath: '/draco/',
    idleSway: true,
};

export class HumanoidFigure {
    constructor(options = {}) {
        this.opts = { ...DEFAULTS, ...options };
        this.group = new THREE.Group();
        this.model = null;
        this.mixer = null;
        this.headBone = null;
        this.triangles = 0;
        this._sourceMaterials = new Map();
        this._materialMode = 'source';
        this._matParams = { roughness: 0.5, metalness: 0.05, envMapIntensity: 0.9 };
        this._xray = { head: 0, body: 0 };
        this._pointer = { x: 0, y: 0 };
        this._smoothPointer = { x: 0, y: 0 };
        this._headBaseQuat = null;
        this._swayTime = 0;
    }

    /**
     * Load a GLB (path or object URL), normalize to opts.height with feet
     * at the group origin. Replaces any previous model.
     */
    async load(url) {
        const loader = new GLTFLoader();
        const draco = new DRACOLoader();
        draco.setDecoderPath(this.opts.dracoPath);
        loader.setDRACOLoader(draco);
        const gltf = await loader.loadAsync(url);
        draco.dispose();

        this.clear();
        const model = gltf.scene;

        // Box3.setFromObject ignores skinning (bind-pose geometry only), so
        // rigged Meshy exports measure wildly wrong; sample skinned verts.
        const box = this._skinnedBBox(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = this.opts.height / Math.max(0.01, size.y);
        model.scale.setScalar(scale);
        this._skinnedBBox(model, box);
        const center = box.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= box.min.y;

        this.triangles = 0;
        this._sourceMaterials.clear();
        this.headBone = null;
        model.traverse((node) => {
            if (node.isBone && !this.headBone && /head/i.test(node.name)) {
                this.headBone = node;
            }
            if (!node.isMesh) return;
            node.castShadow = true;
            node.receiveShadow = false;
            if (node.isSkinnedMesh) node.frustumCulled = false;
            this._sourceMaterials.set(node, node.material);
            const index = node.geometry.getIndex();
            this.triangles += (index ? index.count : node.geometry.attributes.position.count) / 3;
        });
        if (this.headBone) this._headBaseQuat = this.headBone.quaternion.clone();

        if (gltf.animations?.length) {
            this.mixer = new THREE.AnimationMixer(model);
            this.mixer.clipAction(gltf.animations[0]).play();
        }

        this.model = model;
        this.group.add(model);
        this._addEyeGlows();
        this.setMaterialMode(this._materialMode);
        return model;
    }

    /** World-space bbox that resolves skinned vertices through their bones. */
    _skinnedBBox(root, target = new THREE.Box3()) {
        root.updateMatrixWorld(true);
        target.makeEmpty();
        const v = new THREE.Vector3();
        root.traverse((node) => {
            if (!node.isMesh) return;
            const pos = node.geometry.attributes.position;
            if (node.isSkinnedMesh) {
                for (let i = 0; i < pos.count; i++) {
                    v.fromBufferAttribute(pos, i);
                    node.applyBoneTransform(i, v);
                    v.applyMatrix4(node.matrixWorld);
                    target.expandByPoint(v);
                }
            } else {
                const geoBox = new THREE.Box3()
                    .setFromBufferAttribute(pos)
                    .applyMatrix4(node.matrixWorld);
                target.union(geoBox);
            }
        });
        return target;
    }

    /** Head center in the figure's local space (feet at origin). */
    headCenterLocal() {
        if (this.headBone) {
            this.group.updateMatrixWorld(true);
            const p = this.headBone.getWorldPosition(new THREE.Vector3());
            return this.group.worldToLocal(p);
        }
        // Anthropometric fallback: head center ~91.5% of standing height.
        return new THREE.Vector3(0, this.opts.height * 0.915, 0);
    }

    /** Neck line in local space -- where the head x-ray mask starts. */
    neckYLocal() {
        return this.headCenterLocal().y - this.opts.height * 0.075;
    }

    // ── eyes ───────────────────────────────────────────────────────

    /**
     * Two small emissive orbs parented near the head bone: "eyes stay
     * lit" during the x-ray moment without needing a texture mask on the
     * generated model. Hidden while both x-ray uniforms are 0.
     */
    _addEyeGlows() {
        const head = this.headCenterLocal();
        const h = this.opts.height;
        const geo = new THREE.SphereGeometry(h * 0.006, 8, 8);
        this._eyeMat = new THREE.MeshBasicMaterial({
            color: 0xbfdcff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
        });
        this.eyes = new THREE.Group();
        for (const side of [-1, 1]) {
            const eye = new THREE.Mesh(geo, this._eyeMat);
            eye.position.set(side * h * 0.017, head.y + h * 0.014, head.z + h * 0.054);
            this.eyes.add(eye);
        }
        this.group.add(this.eyes);
    }

    // ── materials ──────────────────────────────────────────────────

    /** 'source' | 'porcelain' | 'xray' */
    setMaterialMode(mode) {
        this._materialMode = mode;
        if (!this.model) return;
        this.model.traverse((node) => {
            if (!node.isMesh) return;
            if (mode === 'porcelain') node.material = this._getPorcelainMat();
            else if (mode === 'xray') node.material = this._getXrayMat();
            else node.material = this._sourceMaterials.get(node) ?? node.material;
        });
        if (mode === 'source') this._applyMatParams();
    }

    /** Tune roughness/metalness/envMapIntensity on the source materials. */
    setMaterialParams(params) {
        Object.assign(this._matParams, params);
        this._applyMatParams();
    }

    _applyMatParams() {
        if (!this.model) return;
        const p = this._matParams;
        this.model.traverse((node) => {
            if (!node.isMesh) return;
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            mats.forEach((m) => {
                if (!('roughness' in m)) return;
                m.roughness = p.roughness;
                m.metalness = p.metalness;
                m.envMapIntensity = p.envMapIntensity;
            });
        });
    }

    /**
     * X-ray blend: 0..1 per zone. body affects the whole figure, head
     * only above the neck line. Any value > 0 switches to the hybrid
     * shader; both at 0 keeps whatever material mode is active.
     */
    setXray({ head, body } = {}) {
        if (head !== undefined) this._xray.head = head;
        if (body !== undefined) this._xray.body = body;
        const mat = this._getXrayMat();
        mat.uniforms.uHeadXray.value = this._xray.head;
        mat.uniforms.uBodyXray.value = this._xray.body;
        if (this._eyeMat) {
            this._eyeMat.opacity = Math.min(1, Math.max(this._xray.head, this._xray.body) * 1.4);
        }
    }

    _getPorcelainMat() {
        if (!this._porcelainMat) {
            this._porcelainMat = new THREE.MeshPhysicalMaterial({
                color: 0xd9d4cb,
                roughness: 0.48,
                metalness: 0.0,
                clearcoat: 0.18,
                clearcoatRoughness: 0.6,
                envMapIntensity: 0.9,
            });
        }
        return this._porcelainMat;
    }

    _getXrayMat() {
        if (!this._xrayMat) {
            this._xrayMat = new THREE.ShaderMaterial({
                transparent: true,
                side: THREE.DoubleSide,
                uniforms: {
                    uHeadXray: { value: 0 },
                    uBodyXray: { value: 0 },
                    // Neck line in WORLD y, refreshed every update() while
                    // x-ray is active (the reveal scales/moves the group).
                    uNeckY: { value: 0 },
                    uNeckBand: { value: this.opts.height * 0.03 },
                    uXrayColor: { value: new THREE.Color(0x9fc4ef) },
                    uShellColor: { value: new THREE.Color(0xd9d4cb) },
                    uKeyDir: { value: new THREE.Vector3(-0.55, 0.7, -0.45).normalize() },
                },
                vertexShader: /* glsl */ `
                    #include <common>
                    #include <skinning_pars_vertex>
                    varying vec3 vNormal;
                    varying vec3 vView;
                    varying float vWorldY;
                    void main() {
                        #include <beginnormal_vertex>
                        #include <skinbase_vertex>
                        #include <skinnormal_vertex>
                        #include <begin_vertex>
                        #include <skinning_vertex>
                        vec4 world = modelMatrix * vec4(transformed, 1.0);
                        vec4 mv = viewMatrix * world;
                        vNormal = normalize(normalMatrix * objectNormal);
                        vView = normalize(-mv.xyz);
                        vWorldY = world.y;
                        gl_Position = projectionMatrix * mv;
                    }`,
                fragmentShader: /* glsl */ `
                    uniform float uHeadXray;
                    uniform float uBodyXray;
                    uniform float uNeckY;
                    uniform float uNeckBand;
                    uniform vec3 uXrayColor;
                    uniform vec3 uShellColor;
                    uniform vec3 uKeyDir;
                    varying vec3 vNormal;
                    varying vec3 vView;
                    varying float vWorldY;
                    void main() {
                        vec3 n = normalize(vNormal);
                        float fres = pow(1.0 - abs(dot(n, normalize(vView))), 2.2);
                        float headMask = smoothstep(uNeckY - uNeckBand, uNeckY + uNeckBand, vWorldY);
                        float xray = max(uBodyXray, headMask * uHeadXray);
                        // Lit porcelain approximation for the solid part.
                        float lit = 0.25 + 0.75 * max(0.0, dot(n, uKeyDir));
                        vec3 solid = uShellColor * lit + fres * 0.15;
                        vec3 holo = uXrayColor * (0.25 + fres);
                        float alpha = mix(1.0, 0.05 + fres * 0.8, xray);
                        gl_FragColor = vec4(mix(solid, holo, xray), alpha);
                        #include <colorspace_fragment>
                    }`,
            });
        }
        return this._xrayMat;
    }

    // ── per-frame ──────────────────────────────────────────────────

    /** Head-tracking input, each axis -1..1 (screen-space pointer). */
    setPointer(x, y) {
        this._pointer.x = x;
        this._pointer.y = y;
    }

    update(dt) {
        if (this.mixer) {
            this.mixer.update(dt);
        } else if (this.model && this.opts.idleSway) {
            // Procedural breathing + weight shift until a rigged clip ships.
            this._swayTime += dt;
            const t = this._swayTime;
            this.model.rotation.y = Math.sin(t * 0.28) * 0.03;
            this.model.rotation.z = Math.sin(t * 0.22 + 1.7) * 0.008;
            this.model.position.y += (Math.sin(t * 0.9) * 0.004 - this.model.position.y) * 0.05;
        }

        // Keep the neck mask honest while the reveal moves/scales the group.
        if (this._xrayMat && this.model && (this._xray.head > 0 || this._xray.body > 0)) {
            this._neckProbe ??= new THREE.Vector3();
            this._neckProbe.set(0, this.neckYLocal(), 0);
            this._xrayMat.uniforms.uNeckY.value = this.group.localToWorld(this._neckProbe).y;
            this._xrayMat.uniforms.uNeckBand.value =
                this.opts.height * 0.03 * this.group.scale.y;
        }

        // Cursor head-tracking: gentle yaw/pitch on the head bone, applied
        // after the mixer so it composes with any clip.
        if (this.headBone && this._headBaseQuat) {
            const sp = this._smoothPointer;
            sp.x += (this._pointer.x - sp.x) * Math.min(1, dt * 4);
            sp.y += (this._pointer.y - sp.y) * Math.min(1, dt * 4);
            this.headBone.quaternion.copy(this._headBaseQuat);
            this.headBone.rotateY(sp.x * 0.35);
            this.headBone.rotateX(-sp.y * 0.18);
        }
    }

    clear() {
        if (!this.model) return;
        this.group.remove(this.model);
        this.model.traverse((node) => {
            if (node.isMesh) {
                node.geometry.dispose();
                const mats = Array.isArray(node.material) ? node.material : [node.material];
                mats.forEach((m) => m.dispose());
            }
        });
        if (this.eyes) {
            this.group.remove(this.eyes);
            this.eyes.children[0]?.geometry.dispose();
            this._eyeMat?.dispose();
            this.eyes = null;
        }
        this.mixer = null;
        this.model = null;
        this.headBone = null;
        this._sourceMaterials.clear();
        this._porcelainMat?.dispose();
        this._porcelainMat = null;
        this._xrayMat?.dispose();
        this._xrayMat = null;
    }

    dispose() {
        this.clear();
        if (this.group.parent) this.group.parent.remove(this.group);
    }
}
