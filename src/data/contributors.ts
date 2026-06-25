/**
 * Contributor wall. Add a line here when a new supporter wants their name listed.
 *
 * Two upstream sources can carry the display name:
 *  1. Stripe Payment Link custom field "display_name" (visible in the Stripe
 *     dashboard on every checkout). This is the primary source. The post-checkout
 *     form can be skipped or closed, but the Stripe field is always asked for.
 *  2. Formspree submissions from src/components/SupportThankYou.astro, subject
 *     "New supporter sign-up". Use this to catch the rare cases where Stripe
 *     was skipped but the post-checkout form was filled.
 *
 * Cadence: copy names in batches (weekly is fine). Format `since` as YYYY-MM.
 * Privacy rules: never paste an email here, never paste a contributor's last
 * name unless they gave you a full real name on purpose, honor every removal
 * request inside 24 hours.
 *
 * Operational gaps you handle manually:
 *  - Cortex cancellations: when a Cortex subscription cancels in Stripe, remove
 *    them from Buttondown's supporter-cortex segment and (if they want) from
 *    this wall.
 *  - Custom-tier upgrade: when a Custom payment crosses a tier threshold ($50
 *    or $100) and you want to grant the higher perks, re-tag them in Buttondown
 *    accordingly.
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
