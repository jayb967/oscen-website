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
const BRAIN_END_SCALE = 0.066;    // brain radius 5.5 -> ~0.36, inside a ~0.44 head
const CRANIUM_LIFT = 0.16;        // head-bone origin sits low; center brain in the cranium

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/** Async factory: constructs, loads the GLB, returns the ready instance. */
export async function createReveal(stage, modelUrl = '/models/humanoid.glb') {
    const reveal = new HumanoidReveal(stage);
    await reveal.figure.load(modelUrl);
    reveal._onModelReady();
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
        this._entry = {
            pos: this.stage.camera.position.clone(),
            target: this.stage._target.clone(),
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
            // A -- the dive: brain shrinks, hologram assembles.
            const t = smooth(clamp01(p / 0.4));
            stage.module.setScale(lerp(1, BRAIN_END_SCALE, t));
            const e = this._entry;
            cam.x = lerp(e.pos.x, -1.15, t);
            cam.y = lerp(e.pos.y, 0.42, t);
            cam.z = lerp(e.pos.z, 2.35, t);
            tgt.x = lerp(e.target.x, 0, t);
            tgt.y = lerp(e.target.y, 0, t);
            tgt.z = lerp(e.target.z, 0, t);
            const holo = smooth(clamp01((p - 0.06) / 0.34));
            fig.setXray({ head: holo, body: holo * 0.85 });
            stage.setBloomStrength(lerp(0.45, 0.6, t));
        } else if (p < 0.7) {
            // B -- closeup orbit, body materializing.
            const t = smooth((p - 0.4) / 0.3);
            stage.module.setScale(BRAIN_END_SCALE);
            const az0 = Math.atan2(-1.15, 2.35);
            const az = lerp(az0, 0.75, t);
            const dist = lerp(2.6, 1.85, t);
            cam.x = Math.sin(az) * dist;
            cam.y = lerp(0.42, 0.22, t);
            cam.z = Math.cos(az) * dist;
            tgt.y = lerp(0, 0.05, t);
            fig.setXray({ head: 1, body: lerp(0.85, 0.3, t) });
            stage.setBloomStrength(lerp(0.6, 0.42, t));
        } else {
            // C -- the pull-back: she goes solid against black.
            const t = smooth((p - 0.7) / 0.3);
            stage.module.setScale(BRAIN_END_SCALE);
            const az = lerp(0.75, 0.18, t);
            const dist = lerp(1.85, 11.5, t);
            cam.x = Math.sin(az) * dist;
            cam.y = lerp(0.22, -1.4, t);
            cam.z = Math.cos(az) * dist;
            tgt.y = lerp(0.05, -2.6, t);
            fig.setXray({ head: lerp(1, 0.35, t), body: lerp(0.3, 0, t) });
            stage.setBloomStrength(lerp(0.42, 0.18, t));
        }

        stage.setCameraPose(cam, tgt);
    }

    /**
     * Dimmed end-state for scrolling PAST the reveal: the figure stays as
     * a quiet backdrop behind later sections without fighting the copy.
     */
    setBackdrop() {
        this._active = false;
        this.figure.setXray({ head: 0.25, body: 0 });
        this.stage.setBloomStrength(0.25);
    }

    /** Scrolled back above the reveal: hand everything back to the brain. */
    reset() {
        this._active = false;
        this._entry = null;
        this.figure.group.visible = false;
        this.figure.setXray({ head: 0, body: 0 });
        this.stage.module.setScale(1);
        this.stage.releaseCameraPose();
    }
}
