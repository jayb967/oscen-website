/**
 * FAQ content. ONE array feeds both the rendered /faq page and its FAQPage
 * JSON-LD, so the two can never drift. Facts come from company.ts and
 * brain.ts. Keep answers at what-it-is / why-it-matters level (patents
 * pending) and never describe a round, terms or returns.
 */
import { BRAIN_STATS } from "./brain";
import { COMPANY, NEURONS_WORDS, SYNAPSES_WORDS } from "./company";

export interface FaqItem {
  q: string;
  /** Plain text: rendered on the page and used verbatim as the JSON-LD answer. */
  a: string;
  links?: { href: string; label: string }[];
}

export const FAQ: FaqItem[] = [
  {
    q: "What is OSCEN?",
    a: `OSCEN is an early-stage company building a brain-inspired AI for robots. Its core is a spiking neural network of about ${NEURONS_WORDS} neurons and ${SYNAPSES_WORDS} live synapses, organized into ${BRAIN_STATS.brainRegions} brain regions, that learns from experience rather than from a training dataset. ${COMPANY.legalName} is a ${COMPANY.entityType} based in ${COMPANY.address.locality}, ${COMPANY.address.regionName}.`,
    links: [{ href: "/architecture", label: "See the architecture" }],
  },
  {
    q: "How is OSCEN different from GPU-based AI?",
    a: "Most robotics AI today is a large transformer trained on GPU clusters and then deployed as a frozen model that has to be retrained to learn something new. OSCEN takes the opposite approach: the brain keeps learning while it runs, from its own experience, with no backpropagation and no retraining cycle. It is not designed to compete with large language models at language. It targets continual learning, real-time adaptation and energy efficiency, the capabilities robots need.",
  },
  {
    q: "What does \"learns continuously\" mean?",
    a: "It means learning and running are the same process. The network adjusts its own connections from the outcomes of what it does, using learning rules grounded in established neuroscience such as spike-timing-dependent plasticity, instead of being trained once on a fixed dataset and then frozen. The goal is to add new skills over time without a retraining run.",
  },
  {
    q: "Does OSCEN need a GPU?",
    a: `No. The ${NEURONS_WORDS}-neuron brain runs and learns as a simulation on an ordinary CPU server today, with no GPUs. Longer term, the design targets low-power neuromorphic and edge hardware. Energy figures for that hardware are projections, and the brain's own power draw has not yet been measured.`,
    links: [{ href: "/research", label: "Energy context on the Research page" }],
  },
  {
    q: "What kind of robots can it control?",
    a: "OSCEN is designed to be body-agnostic. A robot attaches through its own interface: it describes what it can sense and do, and a plugin connects the brain to that robot's commands, so a new body does not require changes to the brain. Today the brain trains on simulated bodies, including a humanoid, and skills such as standing and walking are still in development.",
  },
  {
    q: "What stage is the company?",
    a: `OSCEN is an ${COMPANY.stage}. The brain runs and trains around the clock on a CPU server, and formal benchmarks on standard tasks are still in progress.`,
  },
  {
    q: "Is the technology patented?",
    a: `${COMPANY.patent}. The site describes what the technology does and why it matters, and keeps the internal mechanisms covered by the filing out of public pages.`,
  },
  {
    q: "Who founded OSCEN?",
    a: "OSCEN was founded in 2026 by Rio Bold, founder and CEO and the architect of the brain. He is a Marine Corps veteran with 13 years of professional software engineering and nearly a decade of independent research in computational neuroscience. Adam Hamersky, also a Marine Corps veteran, is cofounder and leads operations.",
    links: [{ href: "/team", label: "Meet the team" }],
  },
  {
    q: "Is OSCEN part of any programs?",
    a: "Yes. OSCEN is a member of NVIDIA Inception, NVIDIA's program for startups, and has received AWS Activate credits.",
  },
  {
    q: "How can investors or partners get in touch?",
    a: `Investors and partners can contact us through the contact page, the investor inquiry page, or by email at ${COMPANY.email}. Robotics companies interested in connecting their platform to the brain can use the same routes. Nothing on this page is an offer to sell, or a solicitation of an offer to buy, any security.`,
    links: [
      { href: "/contact", label: "Contact" },
      { href: "/invest", label: "Investor inquiry" },
    ],
  },
  {
    q: "Where can I read the research?",
    a: "The Research page covers the neuroscience foundations, energy context, an honest assessment of current limitations, and key references. The Architecture page explains the brain's regions and how information flows between them. Formal benchmarks on standard tasks have not yet been published.",
    links: [
      { href: "/research", label: "Research" },
      { href: "/architecture", label: "Architecture" },
    ],
  },
];
