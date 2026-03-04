/**
 * Brain architecture data — single source of truth for all brain-related
 * content across the site. Region data mirrors brain-viz/data-bridge.js
 * but is statically typed for use in Astro components.
 */

export interface Region {
  id: string;
  label: string;
  neurons: number;
  color: [number, number, number];
  description: string;
  connections: string;
}

export interface SynapsePathway {
  id: string;
  src: string;
  dst: string;
}

export const REGIONS: Region[] = [
  {
    id: "brainstem", label: "Brainstem", neurons: 1800, color: [1.0, 0.3, 0.2],
    description: "Manages basic survival drives like energy, temperature, and fatigue. Converts raw sensor signals into neural spikes. Always active, the brain's heartbeat.",
    connections: "Feeds sensory cortex and motor cortex",
  },
  {
    id: "reflex_arc", label: "Reflex Arc", neurons: 1000, color: [1.0, 0.6, 0.2],
    description: "Ultra-fast sensory-to-motor pathway that bypasses higher cognition. Handles immediate danger responses in under 10ms, like pulling away from heat.",
    connections: "Receives from sensory cortex, drives motor cortex",
  },
  {
    id: "sensory_cortex", label: "Sensory Cortex", neurons: 200_000, color: [0.13, 0.83, 0.93],
    description: "Processes all incoming sensory data: vision, audio, touch, proprioception. Each modality occupies a dedicated sub-region.",
    connections: "Sends to association, motor, cerebellum, features",
  },
  {
    id: "motor_cortex", label: "Motor Cortex", neurons: 100_000, color: [0.22, 0.85, 0.48],
    description: "Generates movement commands across 6 sub-ranges: locomotion, manipulation, head, speech, expression, and cognitive action.",
    connections: "Receives from all regions, outputs motor commands",
  },
  {
    id: "cerebellum", label: "Cerebellum", neurons: 50_000, color: [0.95, 0.85, 0.2],
    description: "Learns precise timing and coordination through error correction. Smooths motor output and builds internal models of body dynamics.",
    connections: "Receives from sensory, refines motor output",
  },
  {
    id: "association_cortex", label: "Association Cortex", neurons: 500_000, color: [0.37, 0.64, 0.96],
    description: "The brain's largest region. Binds different sensory modalities together. Cross-modal associations form via STDP learning.",
    connections: "Hub connecting all other regions",
  },
  {
    id: "predictive_layer", label: "Predictive Layer", neurons: 100_000, color: [0.65, 0.45, 0.96],
    description: "Continuously predicts what comes next. High prediction error triggers attention and accelerated learning. Drives curiosity.",
    connections: "Bidirectional with association and concepts",
  },
  {
    id: "working_memory", label: "Working Memory", neurons: 20_000, color: [0.96, 0.45, 0.71],
    description: "Sustained firing patterns maintain information across time steps, holding a thought in mind for short-term reasoning.",
    connections: "Receives from association and concepts, drives motor",
  },
  {
    id: "feature_layer", label: "Feature Layer", neurons: 20_000, color: [0.13, 0.78, 0.75],
    description: "Extracts intermediate features: edges, textures, phonemes. Learns hierarchical representations automatically through STDP.",
    connections: "Sits between sensory cortex and association",
  },
  {
    id: "concept_layer", label: "Concept Layer", neurons: 5_000, color: [0.96, 0.73, 0.15],
    description: "Forms abstract concepts using winner-take-all competition. Sparse codes where only a few neurons fire per concept.",
    connections: "Receives from association and predictive layers",
  },
  {
    id: "meta_controller", label: "Meta Controller", neurons: 3_000, color: [0.9, 0.9, 0.95],
    description: "Executive control. Modulates attention, gates learning, coordinates global brain state. The closest analog to conscious decision-making.",
    connections: "Modulates association and motor cortex",
  },
];

export const SYNAPSE_PATHWAYS: SynapsePathway[] = [
  { id: "brainstem_sensory",      src: "brainstem",         dst: "sensory_cortex" },
  { id: "sensory_reflex",         src: "sensory_cortex",    dst: "reflex_arc" },
  { id: "sensory_association",    src: "sensory_cortex",    dst: "association_cortex" },
  { id: "sensory_motor",          src: "sensory_cortex",    dst: "motor_cortex" },
  { id: "sensory_cerebellum",     src: "sensory_cortex",    dst: "cerebellum" },
  { id: "sensory_feature",        src: "sensory_cortex",    dst: "feature_layer" },
  { id: "association_lateral",    src: "association_cortex", dst: "association_cortex" },
  { id: "association_predictive", src: "association_cortex", dst: "predictive_layer" },
  { id: "association_working",    src: "association_cortex", dst: "working_memory" },
  { id: "association_meta",       src: "association_cortex", dst: "meta_controller" },
  { id: "association_concept",    src: "association_cortex", dst: "concept_layer" },
  { id: "predictive_association", src: "predictive_layer",  dst: "association_cortex" },
  { id: "predictive_recurrent",   src: "predictive_layer",  dst: "predictive_layer" },
  { id: "predictive_concept",     src: "predictive_layer",  dst: "concept_layer" },
  { id: "reflex_motor",           src: "reflex_arc",        dst: "motor_cortex" },
  { id: "brainstem_motor",        src: "brainstem",         dst: "motor_cortex" },
  { id: "cerebellum_motor",       src: "cerebellum",        dst: "motor_cortex" },
  { id: "working_motor",          src: "working_memory",    dst: "motor_cortex" },
  { id: "feature_association",    src: "feature_layer",     dst: "association_cortex" },
  { id: "concept_lateral",        src: "concept_layer",     dst: "concept_layer" },
  { id: "concept_predictive",     src: "concept_layer",     dst: "predictive_layer" },
  { id: "concept_working",        src: "concept_layer",     dst: "working_memory" },
  { id: "meta_association",       src: "meta_controller",   dst: "association_cortex" },
  { id: "meta_motor",             src: "meta_controller",   dst: "motor_cortex" },
];

/** Aggregate stats for the 1M neuron deployment */
export const BRAIN_STATS = {
  totalNeurons: 1_001_800,
  totalSynapses: 1_190_000_000,
  synapseGroups: 24,
  brainRegions: 11,
  learningMechanisms: 6,
  developmentalPhases: 5,
} as const;

/** Format large numbers for display: 1001800 → "1M+" */
export function formatNeurons(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

/** Convert [r,g,b] float triple (0-1) to hex string */
export function rgbToHex(rgb: [number, number, number]): string {
  return "#" + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
}
