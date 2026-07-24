/**
 * The five-step processing pipeline. Single source of truth for the
 * HowItWorks section markup AND the brain choreography (each step maps
 * to a real region id from src/three/brain/data-bridge.js REGIONS).
 */
export interface PipelineStep {
    num: string;
    title: string;
    desc: string;
    /** Design-token accent name, e.g. "accent-cyan" -> var(--color-accent-cyan) */
    accent: string;
    /** Brain region id the camera focuses + flares during this step. */
    region: string;
}

export const PIPELINE_STEPS: PipelineStep[] = [
    {
        num: "01",
        title: "Sense",
        desc: "Cameras see. Microphones hear. Touch sensors feel. Like your eyes and ears, every input streams in raw, all the time.",
        accent: "accent-cyan",
        region: "sensory_cortex",
    },
    {
        num: "02",
        title: "Encode",
        desc: "Each input gets turned into spikes, the brain's native language. Edges show up in vision. Sounds become patterns. Nothing is pre-chewed.",
        accent: "accent-blue",
        region: "feature_layer",
    },
    {
        num: "03",
        title: "Think",
        desc: "Half a million neurons connect the dots. The brain links what it is sensing now to what it has seen before. Memory, prediction, and decision happen together.",
        accent: "accent-purple",
        region: "association_cortex",
    },
    {
        num: "04",
        title: "Act",
        desc: "Signals fire out to the body. Walk. Grab. Speak. The robot moves in real time, with no round trip to a data center.",
        accent: "accent-green",
        region: "motor_cortex",
    },
    {
        num: "05",
        title: "Learn",
        desc: "What just happened comes back as feedback. Connections strengthen or fade based on the outcome. One step later, the brain is different. Better.",
        accent: "accent-amber",
        region: "predictive_layer",
    },
];
