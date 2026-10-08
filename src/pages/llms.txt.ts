/**
 * /llms.txt (llms.txt convention: https://llmstxt.org). Generated at build
 * time from src/data/company.ts and brain.ts instead of a static
 * public/llms.txt, so the facts here can never drift from the JSON-LD and
 * the FAQ. Securities rule: stage and contact route only, no round, terms
 * or returns.
 */
import type { APIRoute } from "astro";
import { BRAIN_STATS } from "../data/brain";
import { COMPANY, NEURONS_WORDS, SITE_URL, SYNAPSES_WORDS } from "../data/company";

const founder = COMPANY.founders[0];

const body = `# ${COMPANY.name}

> ${COMPANY.summary} ${COMPANY.legalName} is a ${COMPANY.entityType} founded in ${COMPANY.foundingDate} and based in ${COMPANY.address.locality}, ${COMPANY.address.regionName}. It is an ${COMPANY.stage}.

${COMPANY.name} is building a brain for robots, not a robot. The brain is designed to be body-agnostic: a robot attaches through its own interface, so a new body does not require changes to the brain. Today the brain trains on simulated bodies, and skills such as standing and walking are still in development.

## Pages

- [Home](${SITE_URL}/): Overview of OSCEN, the problem with frozen, GPU-trained robot AI, and the brain-inspired alternative.
- [Architecture](${SITE_URL}/architecture): The brain's ${BRAIN_STATS.brainRegions} regions, learning rules and processing hierarchy, for technical readers.
- [Research](${SITE_URL}/research): Neuroscience foundations, energy context, an honest assessment of current limitations, and references.
- [Team](${SITE_URL}/team): The people building OSCEN and the approach behind the brain.
- [FAQ](${SITE_URL}/faq): Plain answers about the technology, the company's stage, the team and how to get in touch.
- [Contact](${SITE_URL}/contact): Contact form for partners, investors, researchers and candidates.

## Key facts

- Legal name: ${COMPANY.legalName} (${COMPANY.entityType}, founded ${COMPANY.foundingDate}, ${COMPANY.address.locality}, ${COMPANY.address.regionName}, USA).
- Founder and CEO: ${founder.name} (known on the site as ${founder.alternateName}).
- Stage: ${COMPANY.stage}.
- Technology: a spiking neural network of about ${NEURONS_WORDS} neurons and about ${SYNAPSES_WORDS} live synapses across ${BRAIN_STATS.brainRegions} brain regions.
- Learning: learns continuously from experience, without backpropagation, training datasets or retraining runs.
- Compute: runs and learns on ordinary CPUs today, with no GPUs. Low-power neuromorphic and edge hardware is the long-term target. The brain's power draw has not yet been measured.
- Purpose: controlling robots. Body-agnostic by design; a robot attaches through its own interface.
- Intellectual property: ${COMPANY.patent}.
- Programs: ${COMPANY.programs.join("; ")}.
- Current status: no published benchmarks on standard tasks yet, and no revenue.

## For investors and partners

- Investors and partners can contact us through the [contact page](${SITE_URL}/contact) or by email at ${COMPANY.email}.
- Nothing on this site is an offer to sell, or a solicitation of an offer to buy, any security.
`;

export const GET: APIRoute = () =>
  new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
