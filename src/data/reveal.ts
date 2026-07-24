/**
 * Copy for the Phase 5 reveal section (brain -> humanoid head).
 * Three captions, one per choreography segment; the step->progress
 * mapping lives in experience.ts.
 */
export interface RevealStep {
  /** Oversized font-tech line */
  verb: string;
  /** Supporting sentence */
  desc: string;
}

export const REVEAL_STEPS: RevealStep[] = [
  {
    verb: "One brain",
    desc: "The brain you just watched learn was never wired to a body. Sense, encode, think, act. None of it assumed hands, wheels, or wings.",
  },
  {
    verb: "Any body",
    desc: "The same million neurons now drive a humanoid. The skull is packaging. The mind is the product.",
  },
  {
    verb: "Skills transfer",
    desc: "Specialist brains train in parallel, each mastering one domain, then teach what they learned to the one that ships.",
  },
];
