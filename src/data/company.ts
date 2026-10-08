/**
 * Company facts. THE ONLY PLACE A COMPANY FACT LIVES: the site-wide JSON-LD
 * (Base.astro via src/lib/jsonld.ts), /llms.txt (src/pages/llms.txt.ts) and
 * the FAQ (src/data/faq.ts) all import from here, never retype a value.
 * Brain numbers stay in brain.ts; the summary strings below derive from it.
 *
 * Securities rule: nothing here or in its consumers may describe a round,
 * a raise amount, a valuation, terms or returns. Stage and contact only.
 */
import { BRAIN_STATS } from "./brain";

export const SITE_URL = "https://oscen.ai";

/** "1.16 million" from BRAIN_STATS.totalNeurons. */
export const NEURONS_WORDS = `${(BRAIN_STATS.totalNeurons / 1_000_000).toFixed(2)} million`;
/** "814 million" from BRAIN_STATS.totalSynapses (a live count, so shown rounded). */
export const SYNAPSES_WORDS = `${Math.round(BRAIN_STATS.totalSynapses / 1_000_000)} million`;

export interface Person {
  name: string;
  /** The name the person goes by on the public site. */
  alternateName?: string;
  jobTitle: string;
  /** Only profiles that already exist and are linked on the site. */
  sameAs?: string[];
}

export const COMPANY = {
  name: "OSCEN",
  legalName: "OSCEN INCORPORATED",
  entityType: "Delaware C-corporation",
  foundingDate: "2026",
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  email: "info@oscen.ai",
  address: { locality: "Denver", region: "CO", regionName: "Colorado", country: "US" },
  stage: "early-stage, pre-revenue research company",
  patent: "Patent pending (U.S. provisional application 63/986,737, filed February 2026)",
  programs: ["NVIDIA Inception member", "AWS Activate credit recipient"],
  founders: [
    {
      name: "Jesus BalderasMiranda",
      alternateName: "Rio Bold",
      jobTitle: "Founder and CEO",
      sameAs: ["https://linkedin.com/in/rio-bold"],
    },
    { name: "Adam Hamersky", jobTitle: "Cofounder, Operations" },
  ] as Person[],
  /** No company social profiles exist yet (see Footer.astro), so none are listed. */
  sameAs: [] as string[],
  /** One-sentence description reused by JSON-LD, llms.txt and the FAQ. */
  summary:
    `OSCEN builds a brain-inspired AI for robots: a spiking neural network of about ${NEURONS_WORDS} neurons ` +
    `and ${SYNAPSES_WORDS} live synapses that learns continuously from experience on ordinary CPUs, ` +
    `without backpropagation, training datasets or retraining runs.`,
} as const;
