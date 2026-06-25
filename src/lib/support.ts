/**
 * Stripe Payment Link config. ONE source of truth for the four /support tiers.
 *
 * Each link must be a Stripe-hosted https://buy.stripe.com/... URL. Env vars
 * take precedence over the hardcoded LINKS fallbacks; both are committed to
 * the repo because the URLs are public (rendered into every /support HTML).
 * The site is for-profit, so phrase everything as "support" or "sponsor",
 * never "donation" or "tax-deductible".
 *
 *   PUBLIC_STRIPE_SUPPORT_SPARK    one-time $20
 *   PUBLIC_STRIPE_SUPPORT_SYNAPSE  one-time $50
 *   PUBLIC_STRIPE_SUPPORT_CORTEX   recurring $100/mo
 *   PUBLIC_STRIPE_SUPPORT_CUSTOM   pay-what-you-want ($1 min, $25 preset)
 *
 * ACCENT is a static lookup keyed by tier.accent. It exists because Tailwind
 * v4's JIT will not pick up class names built from template literals like
 * `text-accent-${tier.accent}` — they have to appear as complete strings
 * somewhere it can scan. Read accent classes from ACCENT[tier.accent] in
 * any component that iterates SUPPORT_TIERS.
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

/**
 * Static Tailwind class strings per accent. Required because Tailwind v4
 * cannot detect `text-accent-${x}` style template-literal classes. Every
 * class here must appear verbatim so the JIT scanner can generate the rule.
 */
export const ACCENT: Record<SupportTier["accent"], {
  textBold: string;
  borderHover: string;
  priceHover: string;
  ctaIdle: string;
  ctaHover: string;
}> = {
  blue: {
    textBold:    "text-accent-blue",
    borderHover: "hover:border-accent-blue/30",
    priceHover:  "group-hover:text-accent-blue",
    ctaIdle:     "text-accent-blue/70",
    ctaHover:    "group-hover:text-accent-blue",
  },
  cyan: {
    textBold:    "text-accent-cyan",
    borderHover: "hover:border-accent-cyan/30",
    priceHover:  "group-hover:text-accent-cyan",
    ctaIdle:     "text-accent-cyan/70",
    ctaHover:    "group-hover:text-accent-cyan",
  },
  amber: {
    textBold:    "text-accent-amber",
    borderHover: "hover:border-accent-amber/30",
    priceHover:  "group-hover:text-accent-amber",
    ctaIdle:     "text-accent-amber/70",
    ctaHover:    "group-hover:text-accent-amber",
  },
  purple: {
    textBold:    "text-accent-purple",
    borderHover: "hover:border-accent-purple/30",
    priceHover:  "group-hover:text-accent-purple",
    ctaIdle:     "text-accent-purple/70",
    ctaHover:    "group-hover:text-accent-purple",
  },
};
