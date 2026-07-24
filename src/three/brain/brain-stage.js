/**
 * BrainStage -- container-scoped renderer shell around BrainModule.
 * Replaces brain-viz's page-owned BrainScene: no window sizing, no URL
 * params, no document.body labels, no self-boot. Everything is options,
 * everything has teardown.
 *
 * Rendering matches the original look: ACES tonemapping, UnrealBloom,
 * fog, starfield, 3-point light rig, neuromodulator-driven mood.
 *
 * Scroll integration (Phase 2): drive `setCameraPose`, `focusRegion`,
 * `module.setScale`, and `setBloomStrength` from GSAP ScrollTrigger.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BrainModule } from './brain-module.js';
import { createGradePass } from './brain-postfx.js';
import { detectQualityTier } from './quality-tier.js';

const DEFAULTS = {
    mode: 'sim',            // 'sim' | 'live'
    wsUrl: null,
    interactive: false,     // true = OrbitControls (dev page); false = auto-orbit + parallax
    autoRotateSpeed: 0.3,
    clearColor: 0x0a0e1a,
    clearAlpha: 1,          // 0 lets the page background show through
    starfield: true,
    maxPixelRatio: 2,
    pauseWhenHidden: true,  // IntersectionObserver + visibilitychange
    respectReducedMotion: true,
    cinematic: true,        // lazy-load the glass shell + point cloud after first paint
    shellUrl: '/models/brain.glb',
    dracoDecoderPath: '/draco/',
};

// Cinematic bloom regime (from canonical brain-scene-cinematic.js): the
// resting point cloud sits dim under a MID threshold so only firing regions
// + pulses bloom. Strength is HARD-CAPPED -- the mood vocabulary in
// experience.ts is scaled into this range.
const BLOOM_THRESHOLD = 0.80;
const BLOOM_RADIUS = 1.05;
const BLOOM_CAP = 0.34;
const BASE_BLOOM = BLOOM_CAP;
const DEFAULT_CAMERA_POS = new THREE.Vector3(14, 4, 8);
const DEFAULT_TARGET = new THREE.Vector3(0, 0.5, -0.5);

export class BrainStage {
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
        this._focusTarget = null;
        this._orbitAngle = Math.atan2(DEFAULT_CAMERA_POS.x, DEFAULT_CAMERA_POS.z);
        this._orbitRadius = Math.hypot(DEFAULT_CAMERA_POS.x, DEFAULT_CAMERA_POS.z);
        this._orbitHeight = DEFAULT_CAMERA_POS.y;
        this._pointer = { x: 0, y: 0 };          // -1..1 parallax input
        this._smoothPointer = { x: 0, y: 0 };
        this._lateralOffset = 0;                 // world units; + pushes brain screen-right
        this._externalPose = false;              // true once scroll owns the camera
        this._reducedMotion =
            this.opts.respectReducedMotion &&
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this._initRenderer();
        this._initScene();
        this._initCamera();
        this._initLights();
        this._initPost();
        if (this.opts.interactive) this._initControls();
        if (this.opts.starfield) this._addStarfield();

        this.module = new BrainModule({
            mode: this.opts.mode,
            wsUrl: this.opts.wsUrl,
        });
        this.scene.add(this.module.group);
        this._updatables = [];   // extra scene actors (Phase 5 humanoid)

        this._smoothNm = { da: 1.2, ne: 1.2, serotonin: 1.0, oxytocin: 0.8 };

        this._initObservers();
        this.start();
    }

    // ── setup ──────────────────────────────────────────────────────

    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: this.opts.clearAlpha < 1,
            powerPreference: 'high-performance',
        });
        const { clientWidth: w, clientHeight: h } = this.container;
        this.renderer.setSize(w, h);
        // GPU auto-tier scales point counts / pixel ratio / post so the
        // cinematic layer never stutters on integrated GPUs. The site's own
        // maxPixelRatio cap (2 desktop / 1.5 mobile) still wins if lower.
        this.quality = detectQualityTier(this.renderer);
        this.renderer.setPixelRatio(Math.min(
            window.devicePixelRatio, this.opts.maxPixelRatio, this.quality.pixelRatio,
        ));
        this.renderer.setClearColor(this.opts.clearColor, this.opts.clearAlpha);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.domElement.style.display = 'block';
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.container.appendChild(this.renderer.domElement);
    }

    _initScene() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(this.opts.clearColor, 0.014);
    }

    _initCamera() {
        const { clientWidth: w, clientHeight: h } = this.container;
        this.camera = new THREE.PerspectiveCamera(50, w / Math.max(1, h), 0.1, 100);
        this.camera.position.copy(DEFAULT_CAMERA_POS);
        this._target = DEFAULT_TARGET.clone();
        this.camera.lookAt(this._target);
    }

    _initLights() {
        this.ambientLight = new THREE.AmbientLight(0x1a2a4a, 0.3);
        this.keyLight = new THREE.PointLight(0x4488cc, 0.5, 30);
        this.keyLight.position.set(5, 10, 5);
        this.fillLight = new THREE.PointLight(0x442244, 0.3, 25);
        this.fillLight.position.set(-5, -5, -5);
        this.rimLight = new THREE.PointLight(0x88aaff, 0.4, 20);
        this.rimLight.position.set(-3, 3, -10);
        this.scene.add(this.ambientLight, this.keyLight, this.fillLight, this.rimLight);
    }

    _initPost() {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        const { clientWidth: w, clientHeight: h } = this.container;
        this._bloomCap = Math.min(this.quality.bloom, BLOOM_CAP);
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(w, h),
            Math.min(BASE_BLOOM, this._bloomCap),
            BLOOM_RADIUS,
            BLOOM_THRESHOLD,
        );
        this.composer.addPass(this.bloomPass);
        this._baseBloom = Math.min(BASE_BLOOM, this._bloomCap);

        // Cinematic color grade (vignette + grain + chromatic aberration),
        // skipped on the low tier to save a full-screen pass.
        if (this.quality.grade) {
            try {
                this.gradePass = createGradePass();
                this.gradePass.uniforms.uGrain.value = this.quality.grain;
                this.composer.addPass(this.gradePass);
            } catch (e) {
                console.warn('[BrainStage] grade pass failed:', e);
            }
        }

        // IBL for the glass shell: PMREM-prefiltered RoomEnvironment on
        // scene.environment ONLY (background stays the dark clear color).
        // The humanoid x-ray ShaderMaterial ignores the env map, so this is
        // safe to set unconditionally.
        try {
            const pmrem = new THREE.PMREMGenerator(this.renderer);
            this._envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
            this.scene.environment = this._envRT.texture;
            pmrem.dispose();
        } catch (e) {
            console.warn('[BrainStage] IBL setup failed:', e);
        }
    }

    _initControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.rotateSpeed = 0.5;
        this.controls.zoomSpeed = 0.8;
        this.controls.autoRotate = !this._reducedMotion;
        this.controls.autoRotateSpeed = this.opts.autoRotateSpeed;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 25;
        this.controls.target.copy(this._target);
    }

    _addStarfield() {
        const count = 500;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 80;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 80;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0x334466, size: 0.08, transparent: true, opacity: 0.4,
        });
        this.starfield = new THREE.Points(geo, mat);
        this.scene.add(this.starfield);
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

    // ── public control surface ─────────────────────────────────────

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
            this.clock.getDelta(); // swallow the pause gap
            this.start();
        } else if (!shouldRun) {
            this.stop();
        }
    }

    /** Parallax input from the page, each axis -1..1. No-op when interactive. */
    setPointer(x, y) {
        this._pointer.x = x;
        this._pointer.y = y;
    }

    /**
     * Scroll-driven camera: once called, auto-orbit stops and the caller
     * owns the pose. Pass {position, target} as Vector3-likes.
     */
    setCameraPose(position, target) {
        this._externalPose = true;
        if (position) this.camera.position.set(position.x, position.y, position.z);
        if (target) this._target.set(target.x, target.y, target.z);
    }

    /**
     * Adjust the idle auto-orbit without taking camera ownership.
     * Used by scroll choreography for dolly-style moves that keep the
     * orbit + parallax alive. Any field may be omitted.
     */
    setOrbit({ radius, height } = {}) {
        if (radius !== undefined) this._orbitRadius = radius;
        if (height !== undefined) this._orbitHeight = height;
    }

    /**
     * Screen-space slide for the idle orbit: the camera strafes along its
     * own right axis so the brain drifts toward one side of the viewport
     * (+x = brain moves screen-right). Scrubbed by the copy sections so
     * their text columns stay clear. Ignored while a scroll scene owns
     * the camera via setCameraPose.
     */
    setLateralOffset(x) {
        this._lateralOffset = x;
    }

    /** Hand the camera back to the idle auto-orbit. */
    releaseCameraPose() {
        this._externalPose = false;
        const p = this.camera.position;
        this._orbitAngle = Math.atan2(p.x, p.z);
        this._orbitRadius = Math.hypot(p.x, p.z);
        this._orbitHeight = p.y;
    }

    /** Glide the look-at target to a region (label or id); null restores default. */
    focusRegion(labelOrId) {
        if (!labelOrId) {
            this._focusTarget = DEFAULT_TARGET.clone();
            return;
        }
        const center = this.module.getRegionCenter(labelOrId);
        if (center) this._focusTarget = center;
    }

    setBloomStrength(s) {
        // Clamped to the cinematic cap so stale-vocabulary callers can't
        // blow out the point cloud.
        this._baseBloom = Math.min(s, this._bloomCap);
    }

    /** Register an object with update(dt), ticked inside the render loop. */
    addUpdatable(obj) {
        if (!this._updatables.includes(obj)) this._updatables.push(obj);
    }

    removeUpdatable(obj) {
        const i = this._updatables.indexOf(obj);
        if (i >= 0) this._updatables.splice(i, 1);
    }

    // ── loop ───────────────────────────────────────────────────────

    _animate() {
        if (this._disposed || !this._running) {
            this._rafId = null;
            return;
        }
        this._rafId = requestAnimationFrame(() => this._animate());
        const dt = Math.min(this.clock.getDelta(), 0.05);

        if (this._focusTarget) {
            if (this.controls) this.controls.target.lerp(this._focusTarget, 0.06);
            else this._target.lerp(this._focusTarget, 0.06);
        }

        if (this.controls) {
            this.controls.update();
        } else if (!this._externalPose) {
            // Idle auto-orbit + soft mouse parallax (replaces OrbitControls
            // in the non-interactive hero; reduced motion = static frame).
            if (!this._reducedMotion) {
                this._orbitAngle += dt * this.opts.autoRotateSpeed * 0.2;
            }
            this._smoothPointer.x += (this._pointer.x - this._smoothPointer.x) * Math.min(1, dt * 3);
            this._smoothPointer.y += (this._pointer.y - this._smoothPointer.y) * Math.min(1, dt * 3);
            const angle = this._orbitAngle + this._smoothPointer.x * 0.08;
            const height = this._orbitHeight + this._smoothPointer.y * 1.2;
            this.camera.position.set(
                Math.sin(angle) * this._orbitRadius,
                height,
                Math.cos(angle) * this._orbitRadius,
            );
            this.camera.lookAt(this._target);
            if (this._lateralOffset) {
                // Strafe AFTER aiming so the view direction is preserved
                // and the brain slides off-center instead of re-centering.
                this._panVec ??= new THREE.Vector3();
                this._panVec.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
                this.camera.position.addScaledVector(this._panVec, -this._lateralOffset);
            }
        } else {
            this.camera.lookAt(this._target);
        }

        this.module.update(dt);
        for (const u of this._updatables) u.update(dt);
        this._updateNeuromodEffects(dt);
        if (this.gradePass) this.gradePass.uniforms.uTime.value += dt;
        this.composer.render();

        // Kick the shell GLB fetch AFTER the first classic-look paint so the
        // cinematic layer never sits in the critical path (LCP rule).
        if (!this._cinematicKicked) {
            this._cinematicKicked = true;
            if (this.opts.cinematic) this._kickCinematic();
        }
    }

    _kickCinematic() {
        const kick = () => {
            this.module.loadCinematic({
                url: this.opts.shellUrl,
                dracoDecoderPath: this.opts.dracoDecoderPath,
                pointCloud: {
                    surfaceCount: this.quality.surfaceCount,
                    fillTotal: this.quality.fillTotal,
                    pixelRatio: this.renderer.getPixelRatio(),
                },
            }).then(() => {
                // Region anchors pick the camera-facing hemisphere for
                // focus glides (and labels, if a page ever adds them).
                this.module.regions.setLabelCamera(this.camera);
            }).catch((e) => console.warn('[BrainStage] cinematic layer failed:', e));
        };
        if ('requestIdleCallback' in window) requestIdleCallback(kick, { timeout: 2000 });
        else setTimeout(kick, 300);
    }

    /** DA warms the key light, NE boosts bloom, 5-HT/OT tint the ambient. */
    _updateNeuromodEffects(dt) {
        const target = this.module.neuromodulation;
        if (!target) return;
        const lerp = Math.min(1, dt * 2);
        const nm = this._smoothNm;

        nm.da += ((target.da || 1.2) - nm.da) * lerp;
        nm.ne += ((target.ne || 1.2) - nm.ne) * lerp;
        nm.serotonin += ((target.serotonin || 1.0) - nm.serotonin) * lerp;
        nm.oxytocin += ((target.oxytocin || 0.8) - nm.oxytocin) * lerp;

        const daWarm = Math.max(0, (nm.da - 0.8) * 0.3);
        this.keyLight.color.setRGB(
            0.27 + daWarm * 0.4,
            0.53 - daWarm * 0.1,
            0.8 - daWarm * 0.3,
        );

        // NE arousal boost, hard-capped so the dense point cloud never blows
        // out (the cinematic regime's version of _updateNeuromodEffects cap).
        const neBoost = Math.max(0, (nm.ne - 0.8) * 0.15);
        this.bloomPass.strength = Math.min(this._baseBloom + neBoost, this._bloomCap);

        this.module.pointCloud?.setNeuromodulation(nm);

        const shtCalm = Math.max(0, (nm.serotonin - 0.5) * 0.15);
        const otWarm = Math.max(0, (nm.oxytocin || 0) - 0.5) * 0.08;
        this.ambientLight.color.setRGB(
            0.1 - shtCalm * 0.03 + otWarm * 0.04,
            0.16 + shtCalm * 0.02,
            0.29 + shtCalm * 0.05 + otWarm * 0.02,
        );
    }

    _onResize() {
        const { clientWidth: w, clientHeight: h } = this.container;
        if (!w || !h) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.composer.setSize(w, h);
        this.bloomPass.resolution.set(w, h);
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
        this.module.dispose();
        if (this.starfield) {
            this.starfield.geometry.dispose();
            this.starfield.material.dispose();
        }
        this._envRT?.dispose();
        this.gradePass?.material?.dispose();
        this.composer.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
