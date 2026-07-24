/**
 * HumanoidStage -- container-scoped renderer for the Phase 4 humanoid.
 * Same contract shape as BrainStage (options in, teardown out, observers
 * for resize/offscreen) but a photographic bright scene instead of the
 * void: warm-gray concrete panels, beige carpet, soft back-left key.
 * Target look: docs/reference/humanoid-target-fullbody.png + -closeup.png.
 *
 * The GLB is loaded on demand (`loadModel`), never in the critical path.
 * Material states: 'source' (as shipped in the GLB), 'porcelain'
 * (matte ceramic override), 'xray' (fresnel shell preview for the
 * Phase 5 brain-in-head moment).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const DEFAULTS = {
    interactive: true,      // OrbitControls (dev); false = fixed pose + idle sway only
    height: 1.75,           // world meters the model is normalized to
    dracoPath: '/draco/',   // self-hosted decoder (copied from three's libs)
    maxPixelRatio: 2,
    pauseWhenHidden: true,
    respectReducedMotion: true,
    environment: true,      // concrete room; false = model only (for the shared canvas later)
    idleSway: true,         // procedural breathing/weight-shift when the GLB has no clip
};

// Camera framings matched by eye against the two target screenshots.
const POSES = {
    fullbody: {
        position: new THREE.Vector3(-0.55, 1.05, 3.4),
        target: new THREE.Vector3(0.05, 0.95, 0),
    },
    closeup: {
        position: new THREE.Vector3(-0.18, 1.5, 1.05),
        target: new THREE.Vector3(0, 1.42, 0),
    },
};

export class HumanoidStage {
    /**
     * @param {HTMLElement} container -- sized by the page; canvas fills it.
     * @param {Object} options -- see DEFAULTS.
     */
    constructor(container, options = {}) {
        this.container = container;
        this.opts = { ...DEFAULTS, ...options };
        this.clock = new THREE.Clock();
        this._disposed = false;
        this._visible = true;
        this._pageVisible = true;
        this._running = false;
        this._rafId = null;
        this.model = null;          // THREE.Group of the loaded GLB
        this.mixer = null;
        this.triangles = 0;
        this._sourceMaterials = new Map();   // mesh -> material as shipped
        this._materialMode = 'source';
        this._matParams = { roughness: 0.5, metalness: 0.05, envMapIntensity: 0.9 };
        this._swayTime = 0;
        this._reducedMotion =
            this.opts.respectReducedMotion &&
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this._initRenderer();
        this._initScene();
        this._initCamera();
        this._initLights();
        if (this.opts.environment) this._buildEnvironment();
        if (this.opts.interactive) this._initControls();
        this._initObservers();
        this.start();
    }

    // ── setup ──────────────────────────────────────────────────────

    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance',
        });
        const { clientWidth: w, clientHeight: h } = this.container;
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.opts.maxPixelRatio));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.domElement.style.display = 'block';
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.container.appendChild(this.renderer.domElement);

        // Neutral studio env map gives the matte shell its soft sheen.
        this._pmrem = new THREE.PMREMGenerator(this.renderer);
        this._envTexture = this._pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    }

    _initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xc1bcb3);
        this.scene.fog = new THREE.Fog(0xc1bcb3, 8, 22);
        this.scene.environment = this._envTexture;
    }

    _initCamera() {
        const { clientWidth: w, clientHeight: h } = this.container;
        this.camera = new THREE.PerspectiveCamera(38, w / Math.max(1, h), 0.05, 60);
        this._target = POSES.fullbody.target.clone();
        this.camera.position.copy(POSES.fullbody.position);
        this.camera.lookAt(this._target);
    }

    _initLights() {
        // One large warm key from the back-left (per the screenshots),
        // hemisphere bounce fill, no colored lights, no hard shadows.
        this.hemiLight = new THREE.HemisphereLight(0xe9e3d7, 0x8f8577, 0.85);
        this.keyLight = new THREE.DirectionalLight(0xfff1dd, 1.6);
        this.keyLight.position.set(-4.5, 5.5, -4);
        this.keyLight.castShadow = true;
        this.keyLight.shadow.mapSize.set(1024, 1024);
        this.keyLight.shadow.camera.left = -3;
        this.keyLight.shadow.camera.right = 3;
        this.keyLight.shadow.camera.top = 4;
        this.keyLight.shadow.camera.bottom = -1;
        this.keyLight.shadow.radius = 6;
        this.keyLight.shadow.bias = -0.0004;
        this.fillLight = new THREE.DirectionalLight(0xdfd9cf, 0.35);
        this.fillLight.position.set(3, 2.5, 4);
        this.scene.add(this.hemiLight, this.keyLight, this.fillLight);
    }

    /** Subtle per-pixel noise so the flat panels read as concrete, not CSS. */
    _noiseTexture({ base, spread = 10, seams = 0, w = 256, h = 256 }) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        const c = new THREE.Color(base);
        ctx.fillStyle = `rgb(${c.r * 255}, ${c.g * 255}, ${c.b * 255})`;
        ctx.fillRect(0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        for (let i = 0; i < img.data.length; i += 4) {
            const n = (Math.random() - 0.5) * spread;
            img.data[i] += n;
            img.data[i + 1] += n;
            img.data[i + 2] += n;
        }
        ctx.putImageData(img, 0, 0);
        if (seams > 0) {
            ctx.strokeStyle = 'rgba(0,0,0,0.10)';
            ctx.lineWidth = 2;
            for (let s = 1; s <= seams; s++) {
                const x = (w / (seams + 1)) * s;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
                ctx.stroke();
            }
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    _buildEnvironment() {
        this.env = new THREE.Group();

        const concrete = (base, seams, repeat = 1) => {
            const map = this._noiseTexture({ base, spread: 9, seams });
            map.repeat.set(repeat, 1);
            return new THREE.MeshStandardMaterial({ map, roughness: 0.94 });
        };

        // Beige carpet floor (heavier noise = pile).
        const floorMat = new THREE.MeshStandardMaterial({
            map: this._noiseTexture({ base: 0xa89d8c, spread: 15, w: 512, h: 512 }),
            roughness: 1,
        });
        floorMat.map.repeat.set(6, 6);
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.env.add(floor);

        // Back wall split by a doorway gap; the gap holds the bright
        // "daylight" panel the key light pretends to come from.
        const wallH = 6;
        const backL = new THREE.Mesh(new THREE.BoxGeometry(5.0, wallH, 0.3), concrete(0xa8a298, 3));
        backL.position.set(-4.2, wallH / 2, -3.2);
        const backR = new THREE.Mesh(new THREE.BoxGeometry(8.0, wallH, 0.3), concrete(0xaea89e, 4));
        backR.position.set(3.3, wallH / 2, -3.6);
        const glow = new THREE.Mesh(
            new THREE.PlaneGeometry(2.4, wallH),
            new THREE.MeshBasicMaterial({ color: 0xf7f1e4, fog: false }),
        );
        glow.position.set(-1.15, wallH / 2, -5.5);
        // Side walls, further out so wide framings still see room edges.
        const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.3, wallH, 14), concrete(0xa29c92, 5));
        sideL.position.set(-5.5, wallH / 2, 2);
        const sideR = new THREE.Mesh(new THREE.BoxGeometry(0.3, wallH, 14), concrete(0xb1aba1, 5));
        sideR.position.set(5.8, wallH / 2, 2);
        this.env.add(backL, backR, glow, sideL, sideR);

        // Soft contact-shadow disc under the feet (cheap, in addition to
        // the real PCF shadow, matches the screenshots' diffuse grounding).
        const discCanvas = document.createElement('canvas');
        discCanvas.width = discCanvas.height = 128;
        const dctx = discCanvas.getContext('2d');
        const grad = dctx.createRadialGradient(64, 64, 8, 64, 64, 62);
        grad.addColorStop(0, 'rgba(40,34,26,0.42)');
        grad.addColorStop(1, 'rgba(40,34,26,0)');
        dctx.fillStyle = grad;
        dctx.fillRect(0, 0, 128, 128);
        const disc = new THREE.Mesh(
            new THREE.PlaneGeometry(1.4, 0.9),
            new THREE.MeshBasicMaterial({
                map: new THREE.CanvasTexture(discCanvas),
                transparent: true,
                depthWrite: false,
            }),
        );
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.01;
        this.env.add(disc);

        this.scene.add(this.env);
    }

    _initControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 0.4;
        this.controls.maxDistance = 12;
        this.controls.maxPolarAngle = Math.PI * 0.55;
        this.controls.target.copy(this._target);
    }

    _initObservers() {
        this._resizeObserver = new ResizeObserver(() => this._onResize());
        this._resizeObserver.observe(this.container);

        if (this.opts.pauseWhenHidden) {
            this._intersectionObserver = new IntersectionObserver((entries) => {
                this._visible = entries[0]?.isIntersecting ?? true;
                this._syncRunning();
            });
            this._intersectionObserver.observe(this.container);

            this._visibilityHandler = () => {
                this._pageVisible = document.visibilityState !== 'hidden';
                this._syncRunning();
            };
            document.addEventListener('visibilitychange', this._visibilityHandler);
        }
    }

    // ── model ──────────────────────────────────────────────────────

    /**
     * Load a GLB (path or object URL), normalize to opts.height with feet
     * at y=0, wire shadows + animation. Replaces any previous model.
     */
    async loadModel(url) {
        const loader = new GLTFLoader();
        const draco = new DRACOLoader();
        draco.setDecoderPath(this.opts.dracoPath);
        loader.setDRACOLoader(draco);
        const gltf = await loader.loadAsync(url);
        draco.dispose();

        this.clearModel();
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
        model.traverse((node) => {
            if (!node.isMesh) return;
            node.castShadow = true;
            node.receiveShadow = false;
            if (node.isSkinnedMesh) node.frustumCulled = false;
            this._sourceMaterials.set(node, node.material);
            const index = node.geometry.getIndex();
            this.triangles += (index ? index.count : node.geometry.attributes.position.count) / 3;
        });

        if (gltf.animations?.length) {
            this.mixer = new THREE.AnimationMixer(model);
            this.mixer.clipAction(gltf.animations[0]).play();
        }

        this.model = model;
        this.scene.add(model);
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

    clearModel() {
        if (!this.model) return;
        this.scene.remove(this.model);
        this.model.traverse((node) => {
            if (node.isMesh) {
                node.geometry.dispose();
                const mats = Array.isArray(node.material) ? node.material : [node.material];
                mats.forEach((m) => m.dispose());
            }
        });
        this.mixer = null;
        this.model = null;
        this._sourceMaterials.clear();
        this._porcelainMat?.dispose();
        this._porcelainMat = null;
        this._xrayMat?.dispose();
        this._xrayMat = null;
    }

    // ── materials ──────────────────────────────────────────────────

    /** 'source' | 'porcelain' | 'xray' */
    setMaterialMode(mode) {
        if (!this.model) {
            this._materialMode = mode;
            return;
        }
        this._materialMode = mode;
        this.model.traverse((node) => {
            if (!node.isMesh) return;
            if (mode === 'porcelain') node.material = this._getPorcelainMat();
            else if (mode === 'xray') node.material = this._getXrayMat();
            else node.material = this._sourceMaterials.get(node) ?? node.material;
        });
        if (mode === 'source') this._applyMatParams();
    }

    /** Tune roughness/metalness/envMapIntensity on the ACTIVE materials. */
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

    _getPorcelainMat() {
        // Satin-ceramic fallback: what the shell should read as if the
        // generated texture misses (matte, warm-white, no gloss).
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
        // Fresnel shell preview for the Phase 5 brain-in-head reveal.
        if (!this._xrayMat) {
            this._xrayMat = new THREE.ShaderMaterial({
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide,
                uniforms: { uColor: { value: new THREE.Color(0x9fc4ef) } },
                vertexShader: /* glsl */ `
                    #include <common>
                    #include <skinning_pars_vertex>
                    varying vec3 vNormal;
                    varying vec3 vView;
                    void main() {
                        #include <beginnormal_vertex>
                        #include <skinbase_vertex>
                        #include <skinnormal_vertex>
                        #include <begin_vertex>
                        #include <skinning_vertex>
                        vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
                        vNormal = normalize(normalMatrix * objectNormal);
                        vView = normalize(-mv.xyz);
                        gl_Position = projectionMatrix * mv;
                    }`,
                fragmentShader: /* glsl */ `
                    uniform vec3 uColor;
                    varying vec3 vNormal;
                    varying vec3 vView;
                    void main() {
                        float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
                        gl_FragColor = vec4(uColor, 0.06 + fres * 0.75);
                    }`,
            });
        }
        return this._xrayMat;
    }

    // ── camera / loop ──────────────────────────────────────────────

    /** Snap to a target-screenshot framing: 'fullbody' | 'closeup'. */
    frame(name) {
        const pose = POSES[name];
        if (!pose) return;
        this.camera.position.copy(pose.position);
        this._target.copy(pose.target);
        if (this.controls) this.controls.target.copy(pose.target);
        this.camera.lookAt(this._target);
    }

    start() {
        this._running = true;
        if (!this._rafId) this._animate();
    }

    stop() {
        this._running = false;
    }

    _syncRunning() {
        const shouldRun = this._visible && this._pageVisible;
        if (shouldRun && !this._running) {
            this.clock.getDelta();
            this.start();
        } else if (!shouldRun) {
            this.stop();
        }
    }

    _animate() {
        if (this._disposed || !this._running) {
            this._rafId = null;
            return;
        }
        this._rafId = requestAnimationFrame(() => this._animate());
        const dt = Math.min(this.clock.getDelta(), 0.05);

        if (this.mixer) {
            this.mixer.update(dt);
        } else if (this.model && this.opts.idleSway && !this._reducedMotion) {
            // Procedural breathing + weight shift until a rigged clip ships.
            this._swayTime += dt;
            const t = this._swayTime;
            this.model.rotation.y = Math.sin(t * 0.28) * 0.03;
            this.model.rotation.z = Math.sin(t * 0.22 + 1.7) * 0.008;
            this.model.position.y += (Math.sin(t * 0.9) * 0.004 - this.model.position.y) * 0.05;
        }

        if (this.controls) this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    _onResize() {
        const { clientWidth: w, clientHeight: h } = this.container;
        if (!w || !h) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    dispose() {
        this._disposed = true;
        this.stop();
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this._resizeObserver?.disconnect();
        this._intersectionObserver?.disconnect();
        if (this._visibilityHandler) {
            document.removeEventListener('visibilitychange', this._visibilityHandler);
        }
        this.controls?.dispose();
        this.clearModel();
        this.env?.traverse((node) => {
            if (node.isMesh) {
                node.geometry.dispose();
                node.material.map?.dispose();
                node.material.dispose();
            }
        });
        this._envTexture.dispose();
        this._pmrem.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
