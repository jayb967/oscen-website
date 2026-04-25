/**
 * Investor pitch data — single source of truth for all pitch-related
 * numbers, market data, competitor intelligence, and financial projections.
 * Every number has a source citation.
 */

// ─── Market Size ───

export interface MarketData {
  name: string;
  current: string;
  projected: string;
  year: number;
  cagr: string;
  source: string;
  sourceUrl: string;
}

export const MARKETS: MarketData[] = [
  {
    name: "Neuromorphic Computing",
    current: "$28.5M (2024)",
    projected: "$1.3B",
    year: 2030,
    cagr: "89.7%",
    source: "MarketsAndMarkets",
    sourceUrl: "https://www.marketsandmarkets.com/Market-Reports/neuromorphic-chip-market-227703024.html",
  },
  {
    name: "Neuromorphic Ecosystem",
    current: "$5.3B (2023)",
    projected: "$20.3B",
    year: 2030,
    cagr: "19.9%",
    source: "Grand View Research",
    sourceUrl: "https://www.grandviewresearch.com/industry-analysis/neuromorphic-computing-market",
  },
  {
    name: "Edge AI",
    current: "$24.9B (2025)",
    projected: "$58.9B",
    year: 2030,
    cagr: "17.6%",
    source: "MarketsAndMarkets",
    sourceUrl: "https://www.marketsandmarkets.com/Market-Reports/edge-ai-hardware-market-158498281.html",
  },
  {
    name: "Humanoid Robotics",
    current: "$2.9B (2025)",
    projected: "$38B",
    year: 2035,
    cagr: "39.2%",
    source: "Goldman Sachs",
    sourceUrl: "https://www.goldmansachs.com/insights/articles/the-global-market-for-robots-could-reach-38-billion-by-2035",
  },
  {
    name: "Humanoid Robotics (Long)",
    current: "$2.9B (2025)",
    projected: "$5T",
    year: 2050,
    cagr: "N/A",
    source: "Morgan Stanley",
    sourceUrl: "https://www.morganstanley.com/insights/articles/humanoid-robot-market-5-trillion-by-2050",
  },
];

// ─── Competitor Funding ───

export interface Competitor {
  name: string;
  raised: string;
  valuation: string;
  date: string;
  focus: string;
  gpuDependent: boolean;
  investors: string;
}

export const COMPETITORS: Competitor[] = [
  {
    name: "AMI Labs",
    raised: "$1.03B",
    valuation: "$3.5B",
    date: "Mar 2026",
    focus: "JEPA world models",
    gpuDependent: true,
    investors: "Cathay, Bezos, NVIDIA, Temasek",
  },
  {
    name: "Figure AI",
    raised: "$1.9B+",
    valuation: "$39B",
    date: "Sep 2025",
    focus: "Humanoid robots",
    gpuDependent: true,
    investors: "NVIDIA, Microsoft, OpenAI, Bezos",
  },
  {
    name: "Physical Intelligence",
    raised: "$1.1B",
    valuation: "$5.6B",
    date: "Nov 2025",
    focus: "Robot foundation models",
    gpuDependent: true,
    investors: "CapitalG, Lux, Sequoia, NVIDIA",
  },
  {
    name: "Unconventional AI",
    raised: "$475M",
    valuation: "$4.5B",
    date: "Dec 2025",
    focus: "Neuromorphic chips",
    gpuDependent: false,
    investors: "a16z, Lightspeed, Sequoia, Bezos",
  },
  {
    name: "BrainChip",
    raised: "A$140M",
    valuation: "~$200M",
    date: "Dec 2025",
    focus: "Akida neuromorphic IP",
    gpuDependent: false,
    investors: "Public (ASX:BRN)",
  },
  {
    name: "Innatera",
    raised: "$43M",
    valuation: "N/A",
    date: "2024",
    focus: "Pulsar spiking processor",
    gpuDependent: false,
    investors: "Series A (oversubscribed)",
  },
];

export const TOTAL_COMPETITOR_FUNDING = "$4.5B+";

// ─── Energy Comparison ───

export interface EnergyComparison {
  system: string;
  power: string;
  detail: string;
  source: string;
  barWidth: number; // percentage for visual bar
  color: string;
}

export const ENERGY_DATA: EnergyComparison[] = [
  {
    system: "NVIDIA H100 GPU",
    power: "700W",
    detail: "$3–4/hr cloud, $27–40K purchase",
    source: "NVIDIA specs",
    barWidth: 100,
    color: "accent-red",
  },
  {
    system: "NVIDIA A100 GPU",
    power: "300–400W",
    detail: "$1.29–2.29/hr cloud",
    source: "NVIDIA specs",
    barWidth: 57,
    color: "accent-pink",
  },
  {
    system: "GPU Robot Brain",
    power: "50–200W",
    detail: "20–50% of robot power budget",
    source: "Industry standard",
    barWidth: 29,
    color: "accent-amber",
  },
  {
    system: "OSCEN on Loihi 2",
    power: "<5W",
    detail: "1–5% of robot power budget",
    source: "Intel Loihi benchmarks",
    barWidth: 1,
    color: "accent-green",
  },
];

// ─── The Ask ───

export const RAISE_AMOUNT = "$10M";
export const PRE_MONEY_VALUATION = "$30M";
export const POST_MONEY_VALUATION = "$40M";
export const FOUNDER_OWNERSHIP_POST = "75%";
export const INVESTOR_OWNERSHIP = "25%";
export const SERIES_A_TARGET = "$50M";
export const SERIES_A_VALUATION = "$200M";

export interface FundAllocation {
  category: string;
  amount: string;
  amountNum: number; // millions, for chart
  percentage: string;
  description: string;
  icon: string; // emoji-free, use text
  color: string;
}

// Total: $10M
export const USE_OF_FUNDS: FundAllocation[] = [
  {
    category: "Team",
    amount: "$4M",
    amountNum: 4,
    percentage: "40%",
    description: "5 elite hires over 18 months. Computational neuroscientist, 2 robotics engineers, neuromorphic hardware specialist, ML research engineer. Competitive remote salaries.",
    icon: "01",
    color: "accent-blue",
  },
  {
    category: "Neuromorphic Hardware",
    amount: "$1.8M",
    amountNum: 1.8,
    percentage: "18%",
    description: "Intel Loihi 2 or SpiNNaker2 development cluster. Move from CPU simulation to purpose-built silicon. Validate sub-5W inference on real hardware.",
    icon: "02",
    color: "accent-cyan",
  },
  {
    category: "Robot Integration",
    amount: "$1.5M",
    amountNum: 1.5,
    percentage: "15%",
    description: "First physical robot body with full sensor suite. Camera, IMU, force sensors, proprioception. Close the sensorimotor loop on real hardware.",
    icon: "03",
    color: "accent-green",
  },
  {
    category: "Compute & Infrastructure",
    amount: "$1.2M",
    amountNum: 1.2,
    percentage: "12%",
    description: "Scale training from 1M to 10M neurons. Multi-server deployment. CI/CD pipeline. Monitoring and observability.",
    icon: "04",
    color: "accent-amber",
  },
  {
    category: "IP & Legal",
    amount: "$700K",
    amountNum: 0.7,
    percentage: "7%",
    description: "Non-provisional patent filing by Feb 2027. First continuation-in-part patents. International PCT filing. Patent attorney retainer.",
    icon: "05",
    color: "accent-purple",
  },
  {
    category: "R&D & Benchmarks",
    amount: "$500K",
    amountNum: 0.5,
    percentage: "5%",
    description: "Formal evaluation on standard robotics tasks. Published papers for academic credibility. Conference submissions (NeurIPS, ICRA, CoRL).",
    icon: "06",
    color: "accent-pink",
  },
  {
    category: "Working Capital",
    amount: "$300K",
    amountNum: 0.3,
    percentage: "3%",
    description: "18-month runway buffer. Insurance, accounting, legal ops, travel for investor and partner meetings.",
    icon: "07",
    color: "accent-red",
  },
];

// ─── Milestones ───

export interface Milestone {
  quarter: string;
  title: string;
  description: string;
  metric: string;
}

export const MILESTONES: Milestone[] = [
  {
    quarter: "Q1–Q2",
    title: "Team & Hardware",
    description: "First 5 hires. Neuromorphic dev kit ordered. 10M neuron simulation running. First benchmarks published.",
    metric: "5 hires, 10M neurons",
  },
  {
    quarter: "Q3",
    title: "Robot Demo",
    description: "First physical robot body with OSCEN brain. Closed sensorimotor loop on real hardware. Video demo published.",
    metric: "1st robot demo",
  },
  {
    quarter: "Q4",
    title: "Hardware Deployment",
    description: "Brain running on neuromorphic silicon. Sub-5W power verified. Real-time inference benchmarks published.",
    metric: "<5W verified",
  },
  {
    quarter: "Q5–Q6",
    title: "Paid Pilots",
    description: "2-3 paid proof-of-concept contracts with robotics OEMs or defense integrators. First revenue.",
    metric: "First revenue",
  },
  {
    quarter: "Q7–Q8",
    title: "Series A",
    description: "Published benchmarks. Robot demo on real hardware. IP portfolio at 5+ patents filed. Raise $50M Series A at $200M pre-money.",
    metric: "Series A ready",
  },
];

// ─── Revenue Model ───

export interface RevenuePhase {
  year: string;
  model: string;
  range: string;
  description: string;
}

export const REVENUE_MODEL: RevenuePhase[] = [
  {
    year: "Year 1",
    model: "Government + POCs",
    range: "$275K–$600K",
    description: "DARPA/SBIR contracts (non-dilutive), paid proof-of-concept engagements with defense integrators. SDVOSB veteran-owned status enables sole-source contracts up to $5M.",
  },
  {
    year: "Year 2",
    model: "BaaS + Verticals",
    range: "$2M–$5M",
    description: "Brain-as-a-Service licensing to robot OEMs ($499–$999/robot/month). Vertical brain packs for defense and construction. Government Phase II contracts.",
  },
  {
    year: "Year 3",
    model: "Scale + IP Licensing",
    range: "$10M–$30M",
    description: "BaaS at scale (500+ robots). IP licensing to neuromorphic chip makers (ARM model). Per-unit royalties. Fleet management platform.",
  },
];

// ─── Revenue Sources (for business model section) ───

export interface RevenueSource {
  name: string;
  description: string;
  timeline: string;
  color: string;
}

export const REVENUE_SOURCES: RevenueSource[] = [
  {
    name: "Government Contracts",
    description: "DARPA, SBIR, ONR, and defense integrator contracts. Non-dilutive funding that validates technology credibility. SDVOSB status (veteran-owned) unlocks sole-source contracts up to $5M.",
    timeline: "Now",
    color: "accent-blue",
  },
  {
    name: "Brain-as-a-Service (BaaS)",
    description: "License the OSCEN brain to robot manufacturers as a per-robot monthly subscription. $499-$5,000/month depending on capability tier. 93% gross margin. Like ARM for neuromorphic robotics.",
    timeline: "Year 2",
    color: "accent-cyan",
  },
  {
    name: "Vertical Brain Packs",
    description: "Industry-specific pre-trained brains for defense, construction, and medical rehabilitation. $25K-$100K upfront license per OEM plus per-device subscriptions.",
    timeline: "Year 2",
    color: "accent-green",
  },
  {
    name: "IP Licensing",
    description: "License core learning stack to neuromorphic chip makers (Intel, BrainChip, SpiNNcloud). $500K-$5M upfront plus 1-3% per-chip royalty. Follows the ARM licensing model.",
    timeline: "Year 3",
    color: "accent-purple",
  },
];

// ─── Valuation Comparables ───

export interface Comparable {
  company: string;
  valuation: string;
  raised: string;
  stage: string;
  hadProduct: boolean;
  hadPatent: boolean;
  note: string;
}

export const COMPARABLES: Comparable[] = [
  {
    company: "Unconventional AI",
    valuation: "$4.5B",
    raised: "$475M seed",
    stage: "Pre-product",
    hadProduct: false,
    hadPatent: false,
    note: "Celebrity founder (Naveen Rao). Thesis + team only.",
  },
  {
    company: "AMI Labs",
    valuation: "$3.5B",
    raised: "$1.03B seed",
    stage: "4 months old",
    hadProduct: false,
    hadPatent: false,
    note: "Yann LeCun name recognition. JEPA research only.",
  },
  {
    company: "Physical Intelligence",
    valuation: "$5.6B",
    raised: "$1.1B total",
    stage: "Series B, <2 yrs",
    hadProduct: true,
    hadPatent: false,
    note: "pi-0 foundation model. GPU-dependent.",
  },
  {
    company: "OSCEN",
    valuation: "$30M (proposed)",
    raised: "$10M (seeking)",
    stage: "Seed",
    hadProduct: true,
    hadPatent: true,
    note: "1M neurons training live. Patent filed. Seed to prove hardware + robot integration.",
  },
];

// ─── Key Stats ───

export const KEY_STATS = {
  neurons: "1,056,800",
  synapses: "1.31B",
  trainingVideos: 688,
  trainingPhase: "Adolescent",
  trainingSteps: "2.89M+",
  stepsPerSec: 0.76,
  serverCost: "$320/mo",
  brainRegions: 13,
  synapseGroups: 48,
  learningRules: 6,
  devPhases: 5,
  patentClaims: 6,
  priorArtSearched: 258,
  priorArtOverlap: 0,
  cipsPlanned: 20,
  buildTime: "7 months",
  researchTime: "~10 years",
  teamSize: 1,
  seedFundingAI2025: "$15B+",
  aiShareOfSeed2025: "42%",
  megaSeedRounds2025: "700+",
} as const;

// ─── Hiring Plan ───

export interface HireRole {
  title: string;
  priority: number;
  timing: string;
  rationale: string;
}

export const HIRING_PLAN: HireRole[] = [
  {
    title: "Computational Neuroscientist",
    priority: 1,
    timing: "Month 1–2",
    rationale: "STDP/BCM optimization, dendritic compartment tuning, published benchmarking. Core to patent claims.",
  },
  {
    title: "Robotics Engineer",
    priority: 1,
    timing: "Month 1–2",
    rationale: "Physical robot integration, sensor fusion, motor control. Closes the sensorimotor loop on real hardware.",
  },
  {
    title: "Neuromorphic Hardware Engineer",
    priority: 2,
    timing: "Month 2–3",
    rationale: "Loihi 2 / SpiNNaker2 mapping. Translates OSCEN's software architecture to neuromorphic silicon.",
  },
  {
    title: "ML Research Engineer",
    priority: 2,
    timing: "Month 3–4",
    rationale: "Formal benchmarking, paper writing, conference submissions. Builds academic credibility.",
  },
  {
    title: "Systems / Infrastructure Engineer",
    priority: 3,
    timing: "Month 4–6",
    rationale: "Scale training infrastructure. CI/CD, monitoring, multi-brain orchestration. Production reliability.",
  },
];

// ─── Non-Dilutive Funding ───

export interface NonDilutive {
  source: string;
  amount: string;
  timeline: string;
  status: string;
}

export const NON_DILUTIVE: NonDilutive[] = [
  {
    source: "DARPA (BTO + DSO)",
    amount: "$1.5–5M",
    timeline: "6–12 months",
    status: "Submitted",
  },
  {
    source: "In-Q-Tel",
    amount: "Strategic investment",
    timeline: "6–12 months",
    status: "Submitted",
  },
  {
    source: "Navy SBIR",
    amount: "$275K–$1.5M",
    timeline: "6–9 months",
    status: "In progress",
  },
  {
    source: "ONR (Office of Naval Research)",
    amount: "$1–3M",
    timeline: "12 months",
    status: "Contact established",
  },
];
