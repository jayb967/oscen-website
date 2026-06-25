/**
 * Stripe Payment Link config. ONE source of truth for the four /support tiers.
 *
 * Replace the placeholder URLs with real Stripe Payment Links (Stripe dashboard
 * → Payment Links → New). Each link must be a Stripe-hosted https://buy.stripe.com/...
 * URL. Set them via env vars in Netlify for prod, or edit the fallback strings
 * here for dev. The site is for-profit, so phrase everything as "support" or
 * "sponsor" — never "donation" or "tax-deductible".
 *
 *   PUBLIC_STRIPE_SUPPORT_SPARK    one-time $5
 *   PUBLIC_STRIPE_SUPPORT_SYNAPSE  one-time $25
 *   PUBLIC_STRIPE_SUPPORT_CORTEX   recurring $100/mo
 *   PUBLIC_STRIPE_SUPPORT_CUSTOM   pay-what-you-want
 */

const env = import.meta.env;

const PLACEHOLDER = "https://buy.stripe.com/PLACEHOLDER";

export type SupportTier = {
  id: "spark" | "synapse" | "cortex" | "custom";
  name: string;
  price: string;
  cadence: "one-time" | "monthly" | "you choose";
  blurb: string;
  perk: string;
  href: string;
  accent: "blue" | "cyan" | "amber" | "purple";
};

export const SUPPORT_TIERS: SupportTier[] = [
  {
    id: "spark",
    name: "Spark",
    price: "$5",
    cadence: "one-time",
    blurb: "Powers about ten thousand simulated neurons for a week.",
    perk: "Our thanks, sent to your inbox.",
    href: env.PUBLIC_STRIPE_SUPPORT_SPARK ?? PLACEHOLDER,
    accent: "cyan",
  },
  {
    id: "synapse",
    name: "Synapse",
    price: "$25",
    cadence: "one-time",
    blurb: "Buys an hour of compute on the brain that's learning right now.",
    perk: "Your name on the contributor wall.",
    href: env.PUBLIC_STRIPE_SUPPORT_SYNAPSE ?? PLACEHOLDER,
    accent: "blue",
  },
  {
    id: "cortex",
    name: "Cortex",
    price: "$100",
    cadence: "monthly",
    blurb: "Sustains a specialist brain learning a new skill, every month.",
    perk: "Monthly progress note plus early demo access.",
    href: env.PUBLIC_STRIPE_SUPPORT_CORTEX ?? PLACEHOLDER,
    accent: "amber",
  },
  {
    id: "custom",
    name: "Choose your own",
    price: "Custom",
    cadence: "you choose",
    blurb: "Whatever fits. Every dollar goes to compute, sensors, and runway.",
    perk: "Same thanks. Same wall. Same access if you cross a tier.",
    href: env.PUBLIC_STRIPE_SUPPORT_CUSTOM ?? PLACEHOLDER,
    accent: "purple",
  },
];

export const SUPPORT_LINKS_CONFIGURED = SUPPORT_TIERS.every(
  (t) => !t.href.includes("PLACEHOLDER"),
);
