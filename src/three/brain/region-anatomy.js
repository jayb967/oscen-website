/**
 * Anatomical anchor map for the Cinematic scene (CINEMATIC-ONLY).
 *
 * The classic scene positions every region from REGION_POSITIONS in
 * data-bridge.js, which is a stylized 2D sagittal-midline schematic (all X=0)
 * authored for the old procedural sphere hull. That collapses the cinematic
 * region labels, synapse endpoints, and neuron->region assignment onto a flat
 * center column when the anatomical GLB mesh is rotated.
 *
 * This file replaces those centers for the cinematic path with normalized
 * ANATOMICAL fractions, which brain-shell.js maps through the loaded GLB mesh's
 * own world-space bounding box (and snaps cortical anchors onto the real
 * cortical surface). It does NOT touch REGION_POSITIONS, so classic + the label
 * layout it feeds are unchanged.
 *
 * Coordinate convention (abstract anatomical fractions; brain-shell.js maps
 * them onto the placed mesh -- AP->world X, SI->world Y, LR->world Z):
 *   ap  anterior <-> posterior. IMPORTANT: on the placed GLB mesh, world +X
 *       renders toward the POSTERIOR (occipital) pole and -X toward the
 *       ANTERIOR (frontal) pole -- the opposite of a naive "anterior +X"
 *       reading. So here:  +1 = back (occipital),  -1 = front (frontal pole).
 *       (The original table was authored under the wrong "anterior +X" belief,
 *       which is why regions read front/back reversed. These values are
 *       recalibrated 2026-07-24 against the anatomical reference diagram
 *       "anterior left, posterior right" using the empirically-fit render map
 *       x_screen ~= 47 + 37.5*ap, y_screen ~= 50.66 - 33.77*si.)
 *   si  superior <-> inferior:   +1 = top (vertex),        -1 = bottom (brainstem)
 *   lr  lateral magnitude:        0 = midline, 1 = full lateral wall.
 *       For `bilateral` regions BOTH +lr and -lr anchors are built so synapse
 *       pulses AND the neuron point cloud light both hemispheres (see
 *       brain-regions.getCenter(id, side) + brain-pulses._buildPathways). The
 *       label uses whichever side faces the camera.
 * Flags:
 *   bilateral  region spans both hemispheres -> gets an L+R anchor pair.
 *   deep       interior structure -> placed inside the volume, NOT snapped to cortex.
 *              (cortical regions are snapped onto the nearest mesh surface vertex.)
 *
 * Nudge values here (never in data-bridge.js) if a label drifts off its
 * gyrus/structure. Each comment lists the reference-diagram target (x/y percent).
 */
export const REGION_ANATOMY = {
    // Brainstem: central stalk, low, midline interior. (target 59/80)
    brainstem:          { ap:  0.32, si: -0.87, lr: 0.0,  bilateral: false, deep: true },
    // Reflex arc: spinal level, below the medulla, midline interior. Pushed
    // below the mesh box (si < -1, no snap since deep) so its label clears the
    // brainstem label. (target 59/92; si -0.98 -> -1.15.)
    reflex_arc:         { ap:  0.32, si: -1.15, lr: 0.0,  bilateral: false, deep: true },
    // Cerebellum: posterior-inferior, bilateral lobes. (target 72/73)
    cerebellum:         { ap:  0.67, si: -0.66, lr: 0.28, bilateral: true,  deep: false },
    // Sensory (postcentral) cortex: superior, just posterior to motor. (target 55/21)
    sensory_cortex:     { ap:  0.21, si:  0.88, lr: 0.48, bilateral: true,  deep: false },
    // Motor (precentral) cortex: superior, just anterior to sensory. (target 46/20)
    motor_cortex:       { ap: -0.03, si:  0.91, lr: 0.48, bilateral: true,  deep: false },
    // Feature layer (visual): occipital pole, posterior, bilateral. (target 85/50)
    feature_layer:      { ap:  0.98, si:  0.02, lr: 0.42, bilateral: true,  deep: false },
    // Association cortex: temporoparietal junction, posterior lateral. (target 66/44)
    association_cortex: { ap:  0.51, si:  0.20, lr: 0.72, bilateral: true,  deep: false },
    // Predictive layer (forward models): posterior, lifted above the cerebellum
    // so its label doesn't collide with the cerebellum label (target ~72/72, but
    // cerebellum sits at the same spot, so predictive rides higher). si -0.63 -> -0.42.
    predictive_layer:   { ap:  0.67, si: -0.42, lr: 0.36, bilateral: true,  deep: false },
    // Working memory (dorsolateral PFC, BA 9/46): anterior-superior. (target 24/26)
    working_memory:     { ap: -0.61, si:  0.73, lr: 0.56, bilateral: true,  deep: false },
    // Concept layer (anterior temporal pole, semantic hub): anterior-inferior. (target 27/62)
    concept_layer:      { ap: -0.53, si: -0.34, lr: 0.56, bilateral: true,  deep: false },
    // Meta controller (frontopolar / dlPFC): anterior-superior midline. (target 21/33)
    meta_controller:    { ap: -0.69, si:  0.52, lr: 0.0,  bilateral: false, deep: false },
    // Pattern separator (dentate gyrus, medial temporal): deep, bilateral. (target 45/60)
    pattern_separator:  { ap: -0.05, si: -0.28, lr: 0.30, bilateral: true,  deep: true },
    // Global workspace (frontoparietal): superior-posterior node, midline.
    // (target 68/28; a second frontal node 25/30 is not separately representable.)
    global_workspace:   { ap:  0.56, si:  0.67, lr: 0.0,  bilateral: false, deep: false },
    // ACC (anterior cingulate, wraps the genu): medial anterior, deep midline. (target 34/38)
    acc:                { ap: -0.35, si:  0.37, lr: 0.0,  bilateral: false, deep: true },
    // Frontoinsular / anterior insula (buried in the Sylvian fissure): deep, bilateral. (target 37/50)
    fi:                 { ap: -0.27, si:  0.02, lr: 0.60, bilateral: true,  deep: true },
};
