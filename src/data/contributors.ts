/**
 * Contributor wall. Add a line here when a new supporter wants their name listed.
 *
 * Source of truth: Formspree submissions from src/components/SupportThankYou.astro.
 * Each submission carries the display name they want, the tier they bought, and
 * the month they signed up. Copy those values verbatim into this list, lowest
 * tier first within a month is fine. Privacy: never paste an email here.
 */

export type ContributorTier = "spark" | "synapse" | "cortex" | "custom";

export type Contributor = {
  name: string;
  tier: ContributorTier;
  since: string;
};

export const CONTRIBUTORS: Contributor[] = [];

export const TIER_DOT: Record<ContributorTier, string> = {
  spark:   "bg-accent-cyan",
  synapse: "bg-accent-blue",
  cortex:  "bg-accent-amber",
  custom:  "bg-accent-purple",
};
