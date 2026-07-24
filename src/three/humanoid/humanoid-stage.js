/**
 * HumanoidStage -- container-scoped renderer for the /dev/humanoid
 * harness. Thin shell: renderer + camera + observers around the shared
 * HumanoidFigure (model/materials/head-tracking) and buildConcreteRoom
 * (environment + lights). The Phase 5 reveal reuses those two modules
 * inside BrainStage's scene instead of this renderer.
 * Target look: docs/reference/humanoid-target-fullbody.png + -closeup.png.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HumanoidFigure } from './humanoid-figure.js';
import { buildConcreteRoom } from './humanoid-environment.js';

const DEFAULTS = {
    interactive: true,      // OrbitControls (dev); false = fixed pose + idle sway only
    height: 1.75,           // world meters the model is normalized to
    dracoPath: '/draco/',   // self-hosted decoder (copied from three's libs)
    maxPixelRatio: 2,
    pauseWhenHidden: true,
    respectReducedMotion: true,
    environment: true,      // concrete room; false = model only
    idleSway: true,         // procedural breathing when the GLB has no clip
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
        this._reducedMotion =
            this.opts.respectReducedMotion &&
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this.figure = new HumanoidFigure({
            height: this.opts.height,
            dracoPath: this.opts.dracoPath,
            idleSway: this.opts.idleSway && !this._reducedMotion,
        });

        this._initRenderer();
        this._initScene();
        this._initCamera();
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
        if (this.opts.environment) {
            this.room = buildConcreteRoom();
            this.scene.add(this.room.group);
            this.keyLight = this.room.lights.key;
        } else {
            this.keyLight = new THREE.DirectionalLight(0xfff1dd, 1.6);
            this.keyLight.position.set(-4.5, 5.5, -4);
            this.scene.add(this.keyLight, new THREE.HemisphereLight(0xe9e3d7, 0x8f8577, 0.85));
        }
        this.scene.add(this.figure.group);
    }

    _initCamera() {
        const { clientWidth: w, clientHeight: h } = this.container;
        this.camera = new THREE.PerspectiveCamera(38, w / Math.max(1, h), 0.05, 60);
        this._target = POSES.fullbody.target.clone();
        this.camera.position.copy(POSES.fullbody.position);
        this.camera.lookAt(this._target);
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

    // ── delegated figure API (keeps the dev page contract stable) ──

    async loadModel(url) {
        const model = await this.figure.load(url);
        return model;
    }

    get triangles() {
        return this.figure.triangles;
    }

    setMaterialMode(mode) {
        if (mode === 'xray') {
            this.figure.setMaterialMode('xray');
            this.figure.setXray({ head: 1, body: 1 });
        } else {
            this.figure.setXray({ head: 0, body: 0 });
            this.figure.setMaterialMode(mode);
        }
    }

    /** Head-shell-only x-ray (body stays porcelain-lit in the shader). */
    setHeadXray(amount) {
        this.figure.setMaterialMode('xray');
        this.figure.setXray({ head: amount, body: 0 });
    }

    setMaterialParams(params) {
        this.figure.setMaterialParams(params);
    }

    setPointer(x, y) {
        this.figure.setPointer(x, y);
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
        this.figure.update(dt);
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
        this.figure.dispose();
        this.room?.dispose();
        this._envTexture.dispose();
        this._pmrem.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
