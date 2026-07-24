/**
 * Cinematic ("wow") brain scene -- v2.
 *
 * Subclasses the classic BrainScene and adds, via the _initEnhancements /
 * _updateEnhancements hooks, the cinematic layer WITHOUT touching the classic
 * render path. All the shared plumbing (renderer, camera, controls, bloom,
 * DataBridge WS contract, postMessage handlers, region labels, Beliefs Mode)
 * is inherited unchanged, so demos and iframe embeds keep working.
 *
 * Phase 1 (this file): anatomical GLB brain shell (glass/transmission) lit by
 * image-based lighting generated from RoomEnvironment (no external HDRI asset).
 * Later phases add the in-volume point cloud, DOF/SSAO/contact-shadow post,
 * cross-section reveal, and the quality auto-tier.
 */
import * as THREE from 'three';
import { BrainScene } from './brain-scene.js?v=18';
import { BrainShell } from './brain-shell.js?v=6';
import { BrainPointCloud } from './brain-pointcloud.js?v=7';
import { createGradePass } from './brain-postfx.js?v=1';
import { detectQualityTier } from './quality-tier.js?v=1';
import { REGION_ANATOMY } from './region-anatomy.js?v=3';
import { REGIONS } from './data-bridge.js?v=5';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export class BrainSceneCinematic extends BrainScene {
    _initEnhancements() {
        // Pick a GPU quality profile up front (scales point count / pixel ratio /
        // post) so the scene never stutters on integrated-GPU laptops in a pitch.
        this.quality = detectQualityTier(this.renderer);
        console.log('[Cinematic] quality tier:', this.quality.tier);
        this.renderer.setPixelRatio(this.quality.pixelRatio);
        this._onResize(); // propagate the new pixel ratio to composer + bloom

        // Bloom = the "glow" on activated parts. The trick against core blowout
        // is a MID threshold + moderate strength: the resting dense point cloud
        // sits dim (uBright 0.14) so it stays under the threshold and does NOT
        // bloom, while FIRING regions + the bright pulse streaks push past it and
        // glow. Threshold 0.80 (was 0.92 in pass 3, which killed the glow) with a
        // 0.34 strength cap and a wide radius gives a visible halo on active
        // regions without the whole-volume white-out pass 3 was fighting.
        // Verified at a zoomed-in framing where the brain fills the frame.
        this._bloomCap = Math.min(this.quality.bloom, 0.34);
        if (this.bloomPass) {
            this.bloomPass.strength = this._bloomCap;
            this.bloomPass.threshold = 0.80;
            this.bloomPass.radius = 1.05;
        }
        this.renderer.toneMappingExposure = 1.0;

        // Curve the synapse arcs so they FOLLOW the mesh surface instead of
        // cutting straight through as chords. A positive radial bow pushes each
        // tube's control points outward from the brain center toward the cortex,
        // so the pathways sweep along the curvature of the brain (fiber-tract
        // look) rather than reading as straight lines. Kept moderate (0.45) so
        // they hug just inside the glass without ballooning out past its surface.
        // (Pulses are rebuilt after the anatomical center overrides are applied,
        // in the shell.load() handler below.)
        if (this.brainSynapses) {
            this.brainSynapses.lateralSpread = 0;
            this.brainSynapses.radialArcScale = 0.45;
        }

        // Cinematic color grade (vignette + grain + chromatic aberration).
        // Appended after bloom; EffectComposer auto-targets the last pass to screen.
        // Skipped on the low tier to save a full-screen pass.
        if (this.quality.grade) {
            try {
                this.gradePass = createGradePass();
                this.gradePass.uniforms.uGrain.value = this.quality.grain;
                this.composer.addPass(this.gradePass);
            } catch (e) {
                console.warn('[Cinematic] grade pass failed:', e);
            }
        }

        // Image-based lighting: PMREM-prefiltered RoomEnvironment. Drives the
        // glass shell's reflections/refraction. We set scene.environment only
        // (NOT scene.background) so the dark clear color is preserved.
        try {
            const pmrem = new THREE.PMREMGenerator(this.renderer);
            const envScene = new RoomEnvironment();
            this._envRT = pmrem.fromScene(envScene, 0.04);
            this.scene.environment = this._envRT.texture;
            pmrem.dispose();
        } catch (e) {
            console.warn('[Cinematic] IBL setup failed:', e);
        }

        // Hide the classic procedural sphere hull -- the anatomical GLB shell
        // replaces it (otherwise a faint wireframe sphere shows inside the brain).
        if (this.brainRegions && this.brainRegions.setHullVisible) {
            this.brainRegions.setHullVisible(false);
        }

        // Anatomical glass brain shell around the particle clouds.
        this.brainShell = new BrainShell(this.scene, this.renderer);
        this.brainShell.load('./assets/brain.glb?v=1').then((mesh) => {
            // Register anatomical anchors on the real mesh so region labels,
            // synapse endpoints, and neuron->region assignment follow the GLB
            // anatomy instead of the midline REGION_POSITIONS schematic.
            // (CINEMATIC-ONLY -- classic never calls setCenterOverride.)
            const anatomy = this.brainShell.buildAnatomyCenters(REGION_ANATOMY, REGIONS);
            for (const region of REGIONS) {
                const a = anatomy[region.id];
                if (!a) continue;
                // cloud[0] = +lr side (also the primary/label anchor);
                // cloud[1] = mirrored -lr side (bilateral). Registering BOTH lets
                // getCenter(id, side) give the synapse pulses a per-hemisphere
                // endpoint so activity lights both halves, not just one.
                const plus = a.cloud[0];
                const minus = a.cloud[1] || a.cloud[0];
                this.brainRegions.setBilateralCenter(region.id, plus, minus);
            }
            // Labels pick whichever hemisphere anchor faces the camera so they
            // stop stacking on one side of the brain.
            this.brainRegions.setLabelCamera(this.camera);
            // Pulses were built in the base ctor from the OLD midline centers, so
            // rebuild them now that getCenter() returns anatomical anchors, one
            // tube per hemisphere.
            if (this.brainSynapses && this.brainSynapses.rebuild) {
                this.brainSynapses.rebuild();
            }

            // Dense GPU neuron point cloud sampled inside/on the brain mesh.
            // Replaces the classic instanced-sphere clouds (hidden below).
            this.pointCloud = new BrainPointCloud(this.scene, {
                surfaceCount: this.quality.surfaceCount,
                fillTotal: this.quality.fillTotal,
                pixelRatio: this.quality.pixelRatio,
                centers: anatomy,   // bilateral L+R anchors light both hemispheres
            });
            const n = this.pointCloud.build(mesh);
            console.log('[Cinematic] neuron point cloud:', n, 'points');
            if (this.brainRegions && this.brainRegions.setCloudVisible) {
                this.brainRegions.setCloudVisible(false);
            }
        }).catch((err) => {
            console.warn('[Cinematic] brain shell / point cloud failed:', err);
        });

        // Cinematic intro: descend from a pulled-back, elevated pose into the
        // default orbit over a few seconds, then hand off to auto-rotate.
        // Skipped when a parent frame drives focus (embed/demo) to avoid fighting it.
        if (!this.embedMode) {
            this._introDur = 3.6;
            this._introT = 0;
            this._introDone = false;
            this._introFrom = new THREE.Vector3(4, 10, 21);
            this._introTo = this.camera.position.clone();
            this.camera.position.copy(this._introFrom);
            this.controls.autoRotate = false;
        }

        // Expose for console-driven tuning during dev.
        window.__oscenShell = this.brainShell;
        window.__oscenCinematic = this;
    }

    _runIntro(dt) {
        if (this._introDone || this._introFrom == null) return;
        // A user drag cancels the intro immediately.
        if (this._focusedRegionId) { this._introDone = true; this.controls.autoRotate = true; return; }
        this._introT += dt;
        let k = Math.min(1, this._introT / this._introDur);
        k = k * k * (3 - 2 * k); // smoothstep ease
        this.camera.position.lerpVectors(this._introFrom, this._introTo, k);
        if (k >= 1) { this._introDone = true; this.controls.autoRotate = true; }
    }

    // The base scene rewrites bloom strength every frame from neuromodulation
    // (arousal boost). Cap it afterward so the dense point cloud never blows out.
    _updateNeuromodEffects(dt) {
        super._updateNeuromodEffects(dt);
        const cap = this._bloomCap ?? 0.6;
        if (this.bloomPass && this.bloomPass.strength > cap) {
            this.bloomPass.strength = cap;
        }
    }

    _updateEnhancements(dt) {
        this._runIntro(dt);
        if (this.brainShell) this.brainShell.update(dt);
        if (this.gradePass) this.gradePass.uniforms.uTime.value += dt;
        if (this.pointCloud) {
            // regionData is refreshed by brainRegions.update() earlier this frame.
            this.pointCloud.setFiringData(this.brainRegions.regionData);
            if (this._smoothNm) this.pointCloud.setNeuromodulation(this._smoothNm);
            this.pointCloud.update(dt);
        }
    }
}

/** Boot entry used by the version-aware bootstrap in index.html. */
export function boot() {
    if (document.readyState === 'loading') {
        return new Promise((resolve) => {
            document.addEventListener('DOMContentLoaded', () => resolve(new BrainSceneCinematic()));
        });
    }
    return new BrainSceneCinematic();
}
