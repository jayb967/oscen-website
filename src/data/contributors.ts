/**
 * Contributor wall tokens.
 *
 * The wall is now sourced LIVE from the CRM. Supporter display names are
 * captured at Stripe checkout and written by the CRM Stripe webhook; the CRM
 * exposes the public, active, wall-eligible list at PUBLIC_SUPPORTERS_URL. This
 * file is no longer hand-edited. See src/components/ContributorWall.astro, which
 * fetches that endpoint on the client and renders the result. Only the shared
 * tier type and dot colors used by that render live here.
 */

export type ContributorTier = "spark" | "synapse" | "cortex" | "custom";

export const TIER_DOT: Record<ContributorTier, string> = {
  spark:   "bg-accent-cyan",
  synapse: "bg-accent-blue",
  cortex:  "bg-accent-amber",
  custom:  "bg-accent-purple",
};
