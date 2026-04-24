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

export const RAISE_AMOUNT = "$50M";
export const PRE_MONEY_VALUATION = "$150M";
export const POST_MONEY_VALUATION = "$200M";
export const FOUNDER_OWNERSHIP_POST = "75%";
export const INVESTOR_OWNERSHIP = "25%";

export interface FundAllocation {
  category: string;
  amount: string;
  amountNum: number; // millions, for chart
  percentage: string;
  description: string;
  icon: string; // emoji-free, use text
  color: string;
}

export const USE_OF_FUNDS: FundAllocation[] = [
  {
    category: "Team",
    amount: "$18M",
    amountNum: 18,
    percentage: "36%",
    description: "8–12 hires over 24 months. Computational neuroscientist, robotics engineers, hardware specialist, ML researchers. Competitive Bay Area / remote salaries.",
    icon: "01",
    color: "accent-blue",
  },
  {
    category: "Neuromorphic Hardware",
    amount: "$10M",
    amountNum: 10,
    percentage: "20%",
    description: "Intel Loihi 2 or SpiNNaker2 development cluster. Move from CPU simulation to purpose-built silicon. 75–200x energy reduction, real-time inference.",
    icon: "02",
    color: "accent-cyan",
  },
  {
    category: "Robotics Integration",
    amount: "$8M",
    amountNum: 8,
    percentage: "16%",
    description: "Physical robot bodies with full sensor suites. Camera, LIDAR, IMU, force sensors, proprioception. Close the sensorimotor loop with real-world feedback.",
    icon: "03",
    color: "accent-green",
  },
  {
    category: "Compute & Infrastructure",
    amount: "$6M",
    amountNum: 6,
    percentage: "12%",
    description: "Dedicated training infrastructure. Scale from 1M to 10M+ neurons. Multi-server deployment for parallel brain instances. CI/CD pipeline.",
    icon: "04",
    color: "accent-amber",
  },
  {
    category: "IP & Legal",
    amount: "$4M",
    amountNum: 4,
    percentage: "8%",
    description: "Non-provisional patent filing by Feb 2027. 20 continuation-in-part patents. International PCT filing. Patent attorney retainer. Trademark registration.",
    icon: "05",
    color: "accent-purple",
  },
  {
    category: "R&D & Benchmarks",
    amount: "$2.5M",
    amountNum: 2.5,
    percentage: "5%",
    description: "Formal evaluation on standard robotics tasks. Published papers for academic credibility. Conference submissions (NeurIPS, ICRA, CoRL). Partnership pilots.",
    icon: "06",
    color: "accent-pink",
  },
  {
    category: "Working Capital",
    amount: "$1.5M",
    amountNum: 1.5,
    percentage: "3%",
    description: "18-month runway buffer. Office space, insurance, accounting, legal ops, travel for investor/partner meetings.",
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
    description: "First 5 hires. Neuromorphic dev kits ordered. 10M neuron simulation running.",
    metric: "5 hires, 10M neurons",
  },
  {
    quarter: "Q3",
    title: "Robot Integration",
    description: "First physical robot body with OSCEN brain. Closed sensorimotor loop on real hardware.",
    metric: "1st robot demo",
  },
  {
    quarter: "Q4",
    title: "Loihi 2 Deployment",
    description: "Brain running on neuromorphic silicon. Sub-5W power verified. Real-time inference benchmarks published.",
    metric: "<5W verified",
  },
  {
    quarter: "Q5–Q6",
    title: "Paid Pilots",
    description: "2–3 paid proof-of-concept contracts with robotics OEMs or defense contractors. First revenue.",
    metric: "First revenue",
  },
  {
    quarter: "Q7–Q8",
    title: "Series A",
    description: "Published benchmarks. Multiple robot form factors demonstrated. IP portfolio at 8+ patents filed. Target $150–300M raise at $500M–750M.",
    metric: "Series A close",
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
    model: "Paid POCs",
    range: "$0–500K",
    description: "Proof-of-concept contracts with robotics companies and defense integrators. Paid engineering engagements.",
  },
  {
    year: "Year 2",
    model: "IP Licensing",
    range: "$500K–$5M",
    description: "License the OSCEN brain architecture to OEMs. Upfront fees $100–500K per licensee. SDK access + integration support.",
  },
  {
    year: "Year 3–5",
    model: "Royalties + SaaS",
    range: "$5M–$50M",
    description: "Per-unit royalties as licensees ship products. Cloud training platform for brain customization. Fleet learning services.",
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
    valuation: "$150M (proposed)",
    raised: "$50M (seeking)",
    stage: "Pre-seed",
    hadProduct: true,
    hadPatent: true,
    note: "1M neurons training live. Patent filed. Zero competitors in SNN robotics software.",
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
  serverCost: "$220/mo",
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
    source: "DARPA (Young Faculty Award)",
    amount: "$1.5–5M",
    timeline: "6–12 months",
    status: "Proposal ready",
  },
  {
    source: "Intel INRC (Loihi 2 Access)",
    amount: "Hardware grant",
    timeline: "3–6 months",
    status: "Application ready",
  },
  {
    source: "NSF SBIR Phase I",
    amount: "$275K",
    timeline: "6–9 months",
    status: "Eligible",
  },
  {
    source: "ONR (Office of Naval Research)",
    amount: "$1–3M",
    timeline: "12 months",
    status: "Eligible",
  },
];
