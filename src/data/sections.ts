/**
 * Landing-section copy, rehoused from inline frontmatter across the
 * section components (Phase 6 audit finding: copy lived in 13 .astro
 * files). One export per section, in page order.
 *
 * Accent policy (Q3/Q6 restyle): ONE decorative accent, blue. Color
 * only carries meaning elsewhere: red = problem/flaw, green = live/
 * OSCEN-advantage. Keep full Tailwind class tokens in these strings
 * (e.g. "text-accent-red") so the scanner sees them.
 */

// ── Problem ────────────────────────────────────────────────────────
export interface ProblemStat {
  value: string;
  label: string;
  back: string;
  source: string;
}

/** All problem stats are red on purpose: they are the wound. */
export const PROBLEM_STATS: ProblemStat[] = [
  {
    value: "~0.3 Wh",
    label: "per query",
    back: "GPT-4o uses ~0.3 Wh per query. Multiply by billions of daily requests.",
    source: "Epoch AI, 2025",
  },
  {
    value: "$100M+",
    label: "to train",
    back: "Training a frontier model costs $100M+. And when it's done, it's frozen forever.",
    source: "Public filings",
  },
  {
    value: "0",
    label: "real-time learning",
    back: "Once deployed, these models can't learn from experience. Static weights. No adaptation.",
    source: "By design",
  },
];

// ── Solution ───────────────────────────────────────────────────────
export interface SolutionFeature {
  title: string;
  body: string;
  link: string;
  linkLabel: string;
}

export const SOLUTION_FEATURES: SolutionFeature[] = [
  {
    title: "Learns from experience",
    body: "Like a kid learning to catch a ball, the brain rewires itself with every try. No instruction manual. No giant training run. A million neurons, learning the way yours did.",
    link: "/architecture",
    linkLabel: "Explore the architecture",
  },
  {
    title: "Runs on a sip of power",
    body: "Today's robot brains burn power like a space heater. OSCEN sips it like a phone charger. Up to 109x less energy on the right chip. That means robots that work all day on one battery.",
    link: "/research",
    linkLabel: "See the benchmarks",
  },
  {
    title: "Grows up in stages",
    body: "Like a baby becoming a toddler becoming a kid, OSCEN moves through five stages of growth. Each one rewires what it can learn next. Old skills stay even as new ones come in.",
    link: "/research",
    linkLabel: "Read the science",
  },
  {
    title: "Works with any body",
    body: "Cameras, microphones, motors, speakers. OSCEN doesn't care what body you bolt it to. The brain is the product. The body plugs in.",
    link: "/architecture",
    linkLabel: "View the integration",
  },
];

// ── Inspired by you ────────────────────────────────────────────────
export interface Comparison {
  yours: string;
  detail: string;
  oscen: string;
  mirror: string;
}

export const COMPARISONS: Comparison[] = [
  {
    yours: "Your neurons fire in spikes",
    detail: "Not continuous signals. Discrete electrical pulses, timed to the millisecond.",
    oscen: "So do ours",
    mirror: "1 million spiking neurons communicate through the same spike-timing mechanism your brain uses right now.",
  },
  {
    yours: "You grew through phases",
    detail: "Infant, toddler, child, adolescent, adult. Each stage rewired your brain differently.",
    oscen: "So does OSCEN",
    mirror: "Five developmental phases prune, myelinate, and consolidate. The same trajectory, compressed into simulation.",
  },
  {
    yours: "You learned by doing",
    detail: "You fell before you walked. Missed before you caught. Every failure was a lesson.",
    oscen: "So does OSCEN",
    mirror: "Motor feedback loops and eligibility traces let the brain learn from outcomes, not curated datasets.",
  },
  {
    yours: "Your senses merge seamlessly",
    detail: "Sight, sound, touch, balance. Your brain binds them into one unified experience.",
    oscen: "So do OSCEN's",
    mirror: "Cross-modal binding through spike-timing coincidence. Any sensor combination, unified by temporal correlation.",
  },
];

// ── Proof ──────────────────────────────────────────────────────────
export interface ProofCard {
  value: string;
  label: string;
  back: string;
  link?: string;
  linkLabel?: string;
}

export const PROOF_CARDS: ProofCard[] = [
  {
    value: "~850M",
    label: "plastic synapses",
    back: "1,156,800 neurons across 15 brain regions. 66 synapse groups. Sensory, motor, association, prediction, working memory, all connected and learning.",
  },
  {
    value: "6",
    label: "learning rules",
    back: "STDP, eligibility traces, BCM metaplasticity, neuromodulation, homeostatic scaling, and reward-modulated learning. All running simultaneously, every step.",
  },
  {
    value: "7 months",
    label: "training continuously",
    back: "Started as a blank slate. Watching video, listening to audio. Forming associations through temporal correlation. Growing through developmental phases.",
  },
  {
    value: "Patent pending",
    label: "US 63/986,737",
    back: "Filed February 20, 2026. 6 core claims covering the complete architecture. 258 prior art patents searched, zero overlap. 20 continuation patents planned.",
    link: "/invest",
    linkLabel: "Patent details",
  },
];

// ── Proof strip ────────────────────────────────────────────────────
export const PROOF_STRIP_ITEMS = [
  { label: "Patent pending", value: "US 63/986,737" },
  { label: "Approach", value: "Brain-inspired" },
];

// ── Real world ─────────────────────────────────────────────────────
export interface RealWorldPair {
  today: string;
  oscen: string;
}

export const REAL_WORLD_PAIRS: RealWorldPair[] = [
  {
    today: "Need a full retrain for every new task",
    oscen: "Pick it up by watching, like a person",
  },
  {
    today: "Forget old skills when learning new ones",
    oscen: "Keep every skill they ever learned",
  },
  {
    today: "Need big batteries or a cloud connection",
    oscen: "All day on a phone-sized battery, no internet",
  },
  {
    today: "Same script in every house",
    oscen: "Adapt to your home, your stuff, your routine",
  },
];

// ── Market ─────────────────────────────────────────────────────────
export interface CompetitorRow {
  name: string;
  approach: string;
  learning: string;
  edge: string;
  energy: string;
  funding: string;
}

export const COMPETITORS: CompetitorRow[] = [
  { name: "Prometheus (Bezos)", approach: "VLA Transformer (Industrial)", learning: "Retrain", edge: "No", energy: "GPU-scale", funding: "$18.2B" },
  { name: "AMI Labs (LeCun)", approach: "JEPA World Models", learning: "Retrain", edge: "No", energy: "50-200W", funding: "$1.03B" },
  { name: "Figure AI", approach: "VLA Transformer (Helix)", learning: "Static", edge: "No", energy: "50-200W", funding: "$1.9B" },
  { name: "Google DeepMind", approach: "Gemini Robotics VLA", learning: "Retrain", edge: "Partial", energy: "50-200W", funding: "Internal" },
  { name: "Physical Intelligence", approach: "3B param VLA", learning: "Static", edge: "Cloud", energy: "50-200W", funding: "$1.1B" },
  { name: "OSCEN", approach: "Spiking Neural Net", learning: "Continual", edge: "Yes", energy: "<5W*", funding: "Bootstrapped" },
];

export interface VlaLimit {
  icon: string;
  label: string;
  stat: string;
  statLabel: string;
  body: string;
}

/** The four VLA flaws stay red: they are warnings, not decoration. */
export const VLA_LIMITS: VlaLimit[] = [
  {
    icon: "&#x26A0;",
    label: "Frozen at birth",
    stat: "0",
    statLabel: "new skills learned after deployment",
    body: "VLAs are trained on millions of demonstrations, then deployed static. They can only do what they've already seen. A new door handle, an unexpected obstacle, a different lighting condition. Anything outside training data is a failure. Retraining costs hundreds of thousands of dollars and weeks of GPU time.",
  },
  {
    icon: "&#x26A1;",
    label: "GPU-hungry",
    stat: "50-200W",
    statLabel: "per inference, every 100ms",
    body: "Every robot action requires a full forward pass through billions of parameters. At 10Hz control rate, that's 30 billion matrix multiplications per second, continuously. A warehouse fleet of 100 robots consumes 5-20kW just thinking. OSCEN targets under 5W total through sparse, event-driven activation. The same power as an LED bulb.",
  },
  {
    icon: "&#x2601;",
    label: "Tethered to the cloud",
    stat: "50-500ms",
    statLabel: "round-trip latency on cloud inference",
    body: "Most VLAs are too large to run on-device efficiently. Physical Intelligence requires cloud. When your robot arm is holding a baby or a surgical tool, 200ms of network latency isn't an engineering tradeoff. It's a liability. OSCEN runs entirely on-edge. No internet, no latency, no data leaving the device.",
  },
  {
    icon: "&#x1F9F1;",
    label: "Catastrophic forgetting",
    stat: "100%",
    statLabel: "of old skills at risk when fine-tuning",
    body: "Fine-tune a VLA on new tasks and it forgets old ones. This is a fundamental limitation of gradient-based learning in large models. OSCEN's homeostatic synaptic scaling, myelination, and identity tagging (Patent Claim 6) explicitly solve this. Learned skills are preserved even as new ones are acquired.",
  },
];

export interface MarketStat {
  value: string;
  label: string;
  sub: string;
}

export const MARKET_STATS: MarketStat[] = [
  { value: "$1.4T", label: "Robotics market by 2030", sub: "Goldman Sachs" },
  { value: "$200M+", label: "Brain-inspired AI VC in 2025", sub: "3x increase from 2024" },
  { value: "73-109x", label: "Energy advantage", sub: "Published spiking-network benchmarks" },
  { value: "0", label: "SNN robotics competitors", sub: "Commercial deployment" },
];

// ── Vision ─────────────────────────────────────────────────────────
export interface VisionPillar {
  icon: string;
  title: string;
  body: string;
}

export const VISION_PILLARS: VisionPillar[] = [
  {
    icon: "◎",
    title: "Any intelligence",
    body: "From 1 million neurons today to eventually 86 billion, like humans. From baby videos to embodied manipulation. From one brain to a fleet sharing learned experiences.",
  },
  {
    icon: "◈",
    title: "Any hardware",
    body: "Software simulation today. Purpose-built low-power compute tomorrow. Optimized for sparse, event-driven inference at the edge. Massive energy reduction without dependency on third-party hardware roadmaps.",
  },
  {
    icon: "◇",
    title: "Any body",
    body: "Robot arms. Humanoids. Surgical assistants. Any sensor, any actuator, any form factor. The brain travels between bodies. The body is interchangeable.",
  },
];

export interface VisionPhase {
  phase: string;
  title: string;
  desc: string;
}

export const VISION_PHASES: VisionPhase[] = [
  {
    phase: "Now",
    title: "The universal robot brain",
    desc: "License OSCEN to robotics companies worldwide. Your robots, our brain. Every manufacturer gets adaptive intelligence that learns on the job, without building their own AI team.",
  },
  {
    phase: "Next",
    title: "Our own robots",
    desc: "Build integrated robots with OSCEN at the core. Purpose-built hardware optimized for sparse, event-driven inference. Robots that learn from day one and never stop improving.",
  },
  {
    phase: "Future",
    title: "Elevate human life",
    desc: "Free humans from labor that machines can do better. Not to replace people, but to give them back their time. A world where intelligence handles the work, and humans choose how to live.",
  },
];

// ── Three paths ────────────────────────────────────────────────────
export interface ConversionPath {
  title: string;
  eyebrow: string;
  desc: string;
  cta: string;
  href: string;
}

export const CONVERSION_PATHS: ConversionPath[] = [
  {
    title: "Invest",
    eyebrow: "Path A · Investors",
    desc: "Accredited investors and Reg CF backers. We'll send the brief after a short qualification step.",
    cta: "Back the brain",
    href: "/invest",
  },
  {
    title: "Build with us",
    eyebrow: "Path B · Collaborators",
    desc: "Engineers, researchers, and robotics partners. Tell us how you'd push it, in your own words.",
    cta: "Apply to collaborate",
    href: "/build",
  },
  {
    title: "Follow",
    eyebrow: "Path C · Followers",
    desc: "One short update when something real happens. No filler. One click to unsubscribe.",
    cta: "Watch it learn",
    href: "#email-capture",
  },
];
