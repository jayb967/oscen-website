/**
 * Stripe Payment Link config + offer ladder. ONE source of truth for /support.
 *
 * Each link must be a Stripe-hosted https://buy.stripe.com/... URL. Env vars
 * take precedence over the hardcoded LINKS fallbacks; both are committed to
 * the repo because the URLs are public (rendered into every /support HTML).
 * The site is for-profit, so phrase everything as "support" or "sponsor",
 * never "donation" or "tax-deductible". Perks are thank-you gifts: personal,
 * non-transferable, never equity, profit, or a claim on a future round.
 *
 *   PUBLIC_STRIPE_SUPPORT_SPARK     one-time $20       Name a Neuron
 *   PUBLIC_STRIPE_SUPPORT_SYNAPSE   one-time $50       Milestone Witness Pass
 *   PUBLIC_STRIPE_SUPPORT_CORTEX    recurring $100/mo  Cortex Circle
 *   PUBLIC_STRIPE_SUPPORT_CUSTOM    pay-what-you-want ($1 min, $25 preset)
 *   PUBLIC_STRIPE_SUPPORT_FOUNDING  one-time $100      numbered crewneck (cap 100)
 *   PUBLIC_STRIPE_SUPPORT_HOLIDAY   one-time $175      gift box (order-by date below)
 *   PUBLIC_STRIPE_SUPPORT_OFFICE    one-time $250      1:1 call (8 a month)
 *   PUBLIC_STRIPE_SUPPORT_REGION    one-time $500      region sponsor (one per region)
 *   PUBLIC_STRIPE_SUPPORT_LABDAY    one-time $2,500    lab day (4 a year)
 *   PUBLIC_STRIPE_SUPPORT_COMPANY   one-time $5,000    company sponsor
 *
 * The spark / synapse / cortex / custom ids are what the CRM webhook knows,
 * so they keep their ids and links even though the offers were renamed. The
 * newer tiers have no fallback link: a tier with no link is not rendered, so
 * the page never shows an offer that cannot be bought. Each link carries
 * metadata.tier = its id, which is how the CRM files the purchase.
 *
 * Every scarcity line must be REAL (FTC dark-patterns guidance). The CRM
 * enforces caps: it deactivates a Payment Link when its cap fills and reopens
 * it when capacity returns, and /support reads live counts from the CRM's
 * public support-status endpoint (src/scripts/support-status.ts).
 *
 * ACCENT is a static lookup keyed by tier.accent. It exists because Tailwind
 * v4's JIT will not pick up class names built from template literals like
 * `text-accent-${tier.accent}`. Read accent classes from ACCENT[tier.accent].
 */
import { BRAIN_STATS } from "../data/brain";

const env = import.meta.env;

const LINKS = {
  spark:   "https://buy.stripe.com/6oU3coe1B75U4toei9gbm05",
  synapse: "https://buy.stripe.com/14AeV66z9eym3pk6PHgbm06",
  cortex:  "https://buy.stripe.com/28E9AM0aL3TIgc6a1Tgbm03",
  custom:  "https://buy.stripe.com/4gMdR2f5FgGuaRM4Hzgbm04",
};

/**
 * Holiday box order-by: 11:59pm Pacific on December 10. Must equal the CRM's
 * holiday close constant (oscencrm src/lib/support-tiers.ts), which closes
 * the Stripe link at the same moment. The card hides itself after it.
 */
export const HOLIDAY_ORDER_BY = "2026-12-11T07:59:59Z";

/** Physical perks ship to US addresses only (the CRM's SHIPPING_COUNTRIES). */
const US_ONLY = "US addresses only.";

export type SupportTier = {
  id:
    | "spark" | "synapse" | "cortex" | "custom"
    | "founding" | "holiday" | "office" | "region" | "labday" | "company";
  name: string;
  price: string;
  cadence: "one-time" | "monthly" | "you choose";
  /** One-line hook: the outcome, not the mechanism. */
  blurb: string;
  /** The value stack, best item first. */
  stack: string[];
  /** Real cap or real deadline, if any. */
  scarcity?: string;
  /** Physical goods / sessions: the window we commit to (FTC Mail Order Rule). */
  ships?: string;
  /** ISO time after which the card hides itself (real deadlines only). */
  expires?: string;
  href: string;
  accent: "blue" | "cyan" | "amber" | "purple";
};

const ALL_TIERS: SupportTier[] = [
  {
    id: "founding",
    name: "Founding 100",
    price: "$100",
    cadence: "one-time",
    blurb: "Be one of the first 100 people to back a brain that learns without a GPU. Wear the number.",
    stack: [
      "Numbered OSCEN-branded crewneck, #1 to #100. This design is never reprinted.",
      "A Founding 100 mark next to your name on the contributor wall, for good",
      "Milestone Witness Pass ($50): first steps and first word, sent the day each happens",
      "Name a Neuron ($20): your name on one neuron in the brain, with a certificate",
    ],
    scarcity: "100 made. When they're gone, this tier closes.",
    ships: `Unisex crewneck, XS to 3XL. Ships in 4 to 6 weeks, or full refund. ${US_ONLY}`,
    href: env.PUBLIC_STRIPE_SUPPORT_FOUNDING ?? "",
    accent: "amber",
  },
  {
    id: "spark",
    name: "Name a Neuron",
    price: "$20",
    cadence: "one-time",
    blurb: "Put your name inside the brain. About a day and a half of compute.",
    stack: [
      "Your name on one numbered neuron in the brain, with the region it lives in",
      "A certificate for your neuron, by email within 7 days",
    ],
    href: env.PUBLIC_STRIPE_SUPPORT_SPARK ?? LINKS.spark,
    accent: "cyan",
  },
  {
    id: "synapse",
    name: "Milestone Witness Pass",
    price: "$50",
    cadence: "one-time",
    blurb: "Be there the first time it walks and the first time it talks. No dates promised. You'll know the day it happens.",
    stack: [
      "The clip of its first steps and its first word, sent to you the day each happens",
      "Your name on the witness list and the contributor wall",
      "Name a Neuron ($20)",
    ],
    href: env.PUBLIC_STRIPE_SUPPORT_SYNAPSE ?? LINKS.synapse,
    accent: "blue",
  },
  {
    id: "cortex",
    name: "Cortex Circle",
    price: "$100",
    cadence: "monthly",
    blurb: "Watch it learn, month by month, from the inside. Keeps a specialist brain running.",
    stack: [
      "OSCEN-branded crewneck with your first month",
      "The Lab Log: a private monthly note and video from the founder, the wins and the misses",
      "A seat on the quarterly live Q&A with the founder",
      "Milestone Witness Pass ($50)",
    ],
    ships: `Billed monthly, cancel anytime. Crewneck ships in 4 to 6 weeks. ${US_ONLY}`,
    href: env.PUBLIC_STRIPE_SUPPORT_CORTEX ?? LINKS.cortex,
    accent: "amber",
  },
  {
    id: "holiday",
    name: "Holiday Gift Box",
    price: "$175",
    cadence: "one-time",
    blurb: "The gift for the person who already has every gadget: a piece of a brain that's still learning.",
    stack: [
      "OSCEN-branded crewneck, shipped straight to them",
      "An \"I backed a brain\" patch and sticker set",
      "A neuron named after them, with a gift certificate",
    ],
    scarcity: "Order by December 10 for delivery before the holidays.",
    ships: `Pick their size at checkout. Ships by December 20, or full refund. ${US_ONLY}`,
    expires: HOLIDAY_ORDER_BY,
    href: env.PUBLIC_STRIPE_SUPPORT_HOLIDAY ?? "",
    accent: "cyan",
  },
  {
    id: "office",
    name: "Office Hours",
    price: "$250",
    cadence: "one-time",
    blurb: "Thirty minutes, one on one, with the person building the brain. Ask anything.",
    stack: [
      "A 30-minute video call with the founder",
      "OSCEN-branded crewneck",
      "Milestone Witness Pass ($50)",
    ],
    scarcity: "8 Office Hours spots a month.",
    ships: `Call held within 30 days. Crewneck ships in 4 to 6 weeks. ${US_ONLY}`,
    href: env.PUBLIC_STRIPE_SUPPORT_OFFICE ?? "",
    accent: "purple",
  },
  {
    id: "region",
    name: "Region Sponsor",
    price: "$500",
    cadence: "one-time",
    blurb: `Sponsor one of the brain's ${BRAIN_STATS.brainRegions} regions. Your name on a part of the mind.`,
    stack: [
      "Honorary sponsor of one brain region, named on the contributor wall",
      "Office Hours ($250): a 30-minute call with the founder",
      "OSCEN-branded crewneck",
      "Milestone Witness Pass ($50)",
    ],
    scarcity: `${BRAIN_STATS.brainRegions} regions. One sponsor each.`,
    ships: `Call held within 30 days. Crewneck ships in 4 to 6 weeks. ${US_ONLY}`,
    href: env.PUBLIC_STRIPE_SUPPORT_REGION ?? "",
    accent: "purple",
  },
  {
    id: "labday",
    name: "Lab Day",
    price: "$2,500",
    cadence: "one-time",
    blurb: "Spend a half day in the lab with the founder, live, while the brain trains.",
    stack: [
      "A half-day live session: watch the brain train, help design a test, name an experiment",
      "Three OSCEN-branded crewnecks, one for you and two to give",
      "Milestone Witness Pass ($50)",
    ],
    scarcity: "4 a year.",
    ships: `Session held within 60 days. Crewnecks ship in 4 to 6 weeks. ${US_ONLY}`,
    href: env.PUBLIC_STRIPE_SUPPORT_LABDAY ?? "",
    accent: "purple",
  },
  {
    id: "company",
    name: "Company Sponsor",
    price: "$5,000",
    cadence: "one-time",
    blurb: "Put your company's name behind a brain that runs robots without a GPU.",
    stack: [
      "Your logo on this page as a company sponsor, once you send it",
      "A 45-minute talk for your team on brain-inspired AI and where it's going",
      "Ten OSCEN-branded crewnecks for your team",
    ],
    ships: `Talk held within 60 days. Crewnecks ship in 4 to 6 weeks. ${US_ONLY}`,
    href: env.PUBLIC_STRIPE_SUPPORT_COMPANY ?? "",
    accent: "blue",
  },
  {
    id: "custom",
    name: "Choose your own",
    price: "Custom",
    cadence: "you choose",
    blurb: "Whatever fits. Every dollar goes to compute, sensors, and runway.",
    stack: ["Give $20 or more for a named neuron. $50 or more adds the Milestone Witness Pass."],
    href: env.PUBLIC_STRIPE_SUPPORT_CUSTOM ?? LINKS.custom,
    accent: "purple",
  },
];

/** Display names by id, for client scripts (the live backers ticker). */
export const TIER_NAMES = Object.fromEntries(ALL_TIERS.map((t) => [t.id, t.name])) as Record<SupportTier["id"], string>;

/** Tier price in USD for ad conversion values, parsed from `price` ("$2,500" -> 2500).
 *  "custom" has no fixed price and is absent. */
export const TIER_PRICE_USD = Object.fromEntries(
  ALL_TIERS.map((t) => [t.id, Number(t.price.replace(/[^0-9.]/g, ""))] as const)
    .filter(([, v]) => Number.isFinite(v) && v > 0),
) as Partial<Record<SupportTier["id"], number>>;

const isLive = (t: SupportTier) =>
  t.href.startsWith("https://buy.stripe.com/") && (!t.expires || Date.now() < Date.parse(t.expires));

/** Only tiers that can actually be bought. */
export const SUPPORT_TIERS = ALL_TIERS.filter(isLive);

const byId = (ids: SupportTier["id"][]) =>
  ids.map((id) => SUPPORT_TIERS.find((t) => t.id === id)).filter((t): t is SupportTier => !!t);

/** Page layout groups. A group with no live tiers renders nothing. */
export const FEATURED_TIER = byId(["founding"])[0];
export const SEASONAL_TIER = byId(["holiday"])[0];
export const CORE_TIERS = byId(["spark", "synapse", "cortex"]);
export const PREMIUM_TIERS = byId(["office", "region", "labday"]);
export const COMPANY_TIER = byId(["company"])[0];
export const CUSTOM_TIER = byId(["custom"])[0];

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
  dot: string;
}> = {
  blue: {
    textBold:    "text-accent-blue",
    borderHover: "hover:border-accent-blue/30",
    priceHover:  "group-hover:text-accent-blue",
    ctaIdle:     "text-accent-blue/70",
    ctaHover:    "group-hover:text-accent-blue",
    dot:         "bg-accent-blue",
  },
  cyan: {
    textBold:    "text-accent-cyan",
    borderHover: "hover:border-accent-cyan/30",
    priceHover:  "group-hover:text-accent-cyan",
    ctaIdle:     "text-accent-cyan/70",
    ctaHover:    "group-hover:text-accent-cyan",
    dot:         "bg-accent-cyan",
  },
  amber: {
    textBold:    "text-accent-amber",
    borderHover: "hover:border-accent-amber/30",
    priceHover:  "group-hover:text-accent-amber",
    ctaIdle:     "text-accent-amber/70",
    ctaHover:    "group-hover:text-accent-amber",
    dot:         "bg-accent-amber",
  },
  purple: {
    textBold:    "text-accent-purple",
    borderHover: "hover:border-accent-purple/30",
    priceHover:  "group-hover:text-accent-purple",
    ctaIdle:     "text-accent-purple/70",
    ctaHover:    "group-hover:text-accent-purple",
    dot:         "bg-accent-purple",
  },
};
