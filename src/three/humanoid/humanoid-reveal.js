/**
 * HumanoidReveal -- Phase 5, the signature moment. Mounts the shared
 * HumanoidFigure INTO BrainStage's scene and drives the
 * whole brain->head choreography from one scrubbed progress value:
 *
 *   p 0.00-0.40  the brain shrinks ~13x while the camera dives after it;
 *                the android assembles in as a fresnel hologram, the
 *                brain landing inside her translucent skull
 *   p 0.40-0.70  closeup orbit around the head (brain pulsing inside),
 *                body materializing from hologram to solid
 *   p 0.70-1.00  camera pulls back to the full figure on black; bloom
 *                tightens to photographic
 *
 * The figure stands alone on black -- no environment (the concrete room
 * lives only in /dev/humanoid's HumanoidStage now, per feedback).
 *
 * World scale: the figure is built HEIGHT=7 brain-units tall and
 * positioned so her head center sits at the brain's shrink destination
 * (the origin). Loaded lazily -- never in the critical path.
 */
import { HumanoidFigure } from './humanoid-figure.js';

const HEIGHT = 7;                 // figure height in brain-world units
// Cinematic shell world extents at scale 1: 13.0 along X (long axis), SI
// 10.7, LR 10.2. The figure faces +Z; without a yaw the long axis lies
// EAR-TO-EAR and pokes out both sides of the skull. Yaw +90deg puts the
// long axis front-back with the brainstem tapering to the BACK of the
// neck (founder-verified 2026-07-25; -90deg had it backwards, stem at
// the face).
const BRAIN_END_SCALE = 0.06;   // founder call: ~60% bigger; glow may kiss the glass, reads fine
const BRAIN_END_YAW = Math.PI / 2;   // anterior +X -> -Z: brainstem tapers to the BACK of the neck
const CRANIUM_LIFT = 0.37;        // head-bone origin sits low; seat brain up in the cranium

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// The brain's visual centroid sits at group-local (0, 0.5, -0.5), so a yaw
// about the group origin swings it sideways (0.5 * scale world units --
// visibly off the head's midline in a front view). Cancel the yaw-induced
// drift so the centroid stays on the head's vertical axis. Identically
// zero at yaw=0, so the dive entry matches the idle scene with no snap.
const BRAIN_CENTROID_Z = -0.5;
function seatBrainGroup(module, s, yaw) {
    module.group.position.set(
        -BRAIN_CENTROID_Z * Math.sin(yaw) * s,
        0,
        BRAIN_CENTROID_Z * (1 - Math.cos(yaw)) * s,
    );
}

/** Async factory: constructs, loads the GLB, returns the ready instance. */
export async function createReveal(stage, modelUrl = '/models/humanoid.glb') {
    const reveal = new HumanoidReveal(stage);
    await reveal.figure.load(modelUrl);
    reveal._onModelReady();
    // Pre-warm the x-ray programs before the reveal is ever scrubbed. The
    // figure is already in the scene but invisible; three's compile()
    // traverses every object regardless of visibility, so this links one
    // ShaderMaterial per mesh (skinned, double-sided) off-thread NOW instead
    // of synchronously on the reveal's first frame -- which was the
    // multi-hundred-ms freeze at that section boundary.
    try {
        await stage.renderer.compileAsync?.(stage.scene, stage.camera);
    } catch (e) {
        console.warn('[reveal] shader pre-warm skipped', e);
    }
    return reveal;
}

export class HumanoidReveal {
    constructor(stage) {
        this.stage = stage;
        this.figure = new HumanoidFigure({ height: HEIGHT, idleSway: true });
        this.figure.group.visible = false;
        stage.scene.add(this.figure.group);
        stage.addUpdatable(this.figure);

        this._entry = null;      // camera pose captured when the scrub begins
        this._active = false;
    }

    _onModelReady() {
        // Feet placed so the head center lands exactly at the origin --
        // which is where the brain group's visual center ends up after
        // scaling about its own origin.
        const head = this.figure.headCenterLocal();
        this.figure.group.position.set(-head.x, -(head.y + CRANIUM_LIFT), -head.z);
        this.figure.setMaterialMode('xray');
        this.figure.setXray({ head: 0, body: 0 });
    }

    /** Capture the live camera as the lerp origin (idle orbit varies). */
    enter() {
        this._active = true;
        this.figure.group.rotation.y = 0;
        this._entry = {
            pos: this.stage.camera.position.clone(),
            target: this.stage._target.clone(),
            // The scrub owns dim from here: the brain arrives at the
            // backdrop mood (0.75, nearly invisible) and must brighten as
            // it lands in the skull or the only glow left is the eyes --
            // which reads as "the brain sits at eye level".
            dim: this.stage.module._dim ?? 0,
        };
    }

    setProgress(p) {
        if (!this._entry) this.enter();
        this._active = true;
        const stage = this.stage;
        const fig = this.figure;
        fig.group.visible = p > 0.02;

        const cam = { x: 0, y: 0, z: 0 };
        const tgt = { x: 0, y: 0, z: 0 };

        if (p < 0.4) {
            // A -- the dive: brain shrinks, hologram assembles. The quarter
            // yaw happens during the shrink so the anatomy lands nose-forward
            // in the skull; at full size it reads as part of the dive.
            const t = smooth(clamp01(p / 0.4));
            const bs = lerp(1, BRAIN_END_SCALE, t);
            const byaw = lerp(0, BRAIN_END_YAW, t);
            stage.module.setScale(bs);
            stage.module.group.rotation.y = byaw;
            seatBrainGroup(stage.module, bs, byaw);
            const e = this._entry;
            cam.x = lerp(e.pos.x, -1.15, t);
            cam.y = lerp(e.pos.y, 0.42, t);
            cam.z = lerp(e.pos.z, 2.35, t);
            tgt.x = lerp(e.target.x, 0, t);
            tgt.y = lerp(e.target.y, 0, t);
            tgt.z = lerp(e.target.z, 0, t);
            const holo = smooth(clamp01((p - 0.06) / 0.34));
            fig.setXray({ head: holo, body: holo * 0.85 });
            stage.setBloomStrength(lerp(0.16, 0.2, t));
            stage.module.setDim(lerp(this._entry.dim, 0, t));
        } else if (p < 0.7) {
            // B -- closeup orbit, body materializing.
            const t = smooth((p - 0.4) / 0.3);
            stage.module.setScale(BRAIN_END_SCALE);
            stage.module.group.rotation.y = BRAIN_END_YAW;
            seatBrainGroup(stage.module, BRAIN_END_SCALE, BRAIN_END_YAW);
            const az0 = Math.atan2(-1.15, 2.35);
            const az = lerp(az0, 0.75, t);
            const dist = lerp(2.6, 1.85, t);
            cam.x = Math.sin(az) * dist;
            cam.y = lerp(0.42, 0.22, t);
            cam.z = Math.cos(az) * dist;
            tgt.y = lerp(0, 0.05, t);
            fig.setXray({ head: 1, body: lerp(0.85, 0.3, t) });
            stage.setBloomStrength(lerp(0.2, 0.14, t));
            stage.module.setDim(0);   // full-brightness brain inside the skull
        } else {
            // C -- the pull-back: she goes solid against black.
            const t = smooth((p - 0.7) / 0.3);
            stage.module.setScale(BRAIN_END_SCALE);
            stage.module.group.rotation.y = BRAIN_END_YAW;
            seatBrainGroup(stage.module, BRAIN_END_SCALE, BRAIN_END_YAW);
            const az = lerp(0.75, 0.18, t);
            const dist = lerp(1.85, 11.5, t);
            cam.x = Math.sin(az) * dist;
            cam.y = lerp(0.22, -1.4, t);
            cam.z = Math.cos(az) * dist;
            tgt.y = lerp(0.05, -2.6, t);
            fig.setXray({ head: lerp(1, 0.35, t), body: lerp(0.3, 0, t) });
            stage.setBloomStrength(lerp(0.14, 0.06, t));
            stage.module.setDim(lerp(0, 0.25, t));  // ease toward quiet for the pull-back
        }

        stage.setCameraPose(cam, tgt);
    }

    /**
     * Post-reveal outro, scrubbed from the end of the pinned reveal to
     * the bottom of the page: the figure turns one slow full revolution
     * while the camera eases from the full-body pose into a
     * head-and-shoulders portrait, landing front-facing at the footer.
     * p=0 matches the reveal's p=1 state exactly, so the hand-off is
     * seamless in both directions.
     */
    setOutro(p) {
        const t = smooth(clamp01(p));
        const fig = this.figure;
        this._active = false;
        fig.group.visible = true;
        fig.group.rotation.y = Math.PI * 2 * t;
        this.stage.module.setScale(BRAIN_END_SCALE);
        // The anatomy is directional now -- the brain must turn WITH the
        // head during the revolution or it pokes through the rotating face.
        const oyaw = BRAIN_END_YAW + Math.PI * 2 * t;
        this.stage.module.group.rotation.y = oyaw;
        seatBrainGroup(this.stage.module, BRAIN_END_SCALE, oyaw);

        const az = lerp(0.18, 0, t);
        const dist = lerp(11.5, 2.7, t);
        this.stage.setCameraPose(
            { x: Math.sin(az) * dist, y: lerp(-1.4, -0.1, t), z: Math.cos(az) * dist },
            { x: 0, y: lerp(-2.6, -0.35, t), z: 0 },
        );
        // Skull glow eases down so late-page copy reads over a quiet head.
        fig.setXray({ head: lerp(0.35, 0.25, t), body: 0 });
        this.stage.setBloomStrength(lerp(0.06, 0.08, t));
        this.stage.module.setDim(lerp(0.25, 0.4, t));
    }

    /**
     * Dimmed end-state fallback for landing PAST the reveal without ever
     * scrubbing it (deep links): quiet figure behind the copy.
     */
    setBackdrop() {
        this._active = false;
        this.figure.setXray({ head: 0.25, body: 0 });
        this.stage.setBloomStrength(0.09);
        this.stage.module.setDim(0.4);
    }

    /** Scrolled back above the reveal: hand everything back to the brain. */
    reset() {
        this._active = false;
        this._entry = null;
        this.figure.group.visible = false;
        this.figure.setXray({ head: 0, body: 0 });
        this.stage.module.setScale(1);
        this.stage.module.group.rotation.y = 0;
        this.stage.module.group.position.set(0, 0, 0);
        this.stage.releaseCameraPose();
    }
}
