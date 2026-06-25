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

const LINKS = {
  spark:   "https://buy.stripe.com/6oU3coe1B75U4toei9gbm05",
  synapse: "https://buy.stripe.com/14AeV66z9eym3pk6PHgbm06",
  cortex:  "https://buy.stripe.com/28E9AM0aL3TIgc6a1Tgbm03",
  custom:  "https://buy.stripe.com/4gMdR2f5FgGuaRM4Hzgbm04",
};

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
    price: "$20",
    cadence: "one-time",
    blurb: "About a day and a half of compute on the brain that's learning right now.",
    perk: "Our thanks, sent to your inbox.",
    href: env.PUBLIC_STRIPE_SUPPORT_SPARK ?? LINKS.spark,
    accent: "cyan",
  },
  {
    id: "synapse",
    name: "Synapse",
    price: "$50",
    cadence: "one-time",
    blurb: "Almost a week of brain time — sensors, learning, the whole stack.",
    perk: "Your name on the contributor wall.",
    href: env.PUBLIC_STRIPE_SUPPORT_SYNAPSE ?? LINKS.synapse,
    accent: "blue",
  },
  {
    id: "cortex",
    name: "Cortex",
    price: "$100",
    cadence: "monthly",
    blurb: "Sustains a specialist brain learning a new skill, every month.",
    perk: "Monthly progress note plus early demo access.",
    href: env.PUBLIC_STRIPE_SUPPORT_CORTEX ?? LINKS.cortex,
    accent: "amber",
  },
  {
    id: "custom",
    name: "Choose your own",
    price: "Custom",
    cadence: "you choose",
    blurb: "Whatever fits. Every dollar goes to compute, sensors, and runway.",
    perk: "Same thanks. Same wall. Same access if you cross a tier.",
    href: env.PUBLIC_STRIPE_SUPPORT_CUSTOM ?? LINKS.custom,
    accent: "purple",
  },
];

export const SUPPORT_LINKS_CONFIGURED = SUPPORT_TIERS.every(
  (t) => t.href.startsWith("https://buy.stripe.com/") && !t.href.endsWith("PLACEHOLDER"),
);
