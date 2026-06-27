/**
 * Typed registry of every Meta Pixel / Conversions API event the site fires.
 *
 * One source of truth for: event names, AEM priority order, page-to-content
 * mapping, and Lead value table. Everything else (meta-pixel.ts, gtm.ts,
 * forms.ts, the Netlify CAPI function) imports from here.
 */

export type StandardEventName =
  | "PageView"
  | "ViewContent"
  | "Lead"
  | "Subscribe"
  | "CompleteRegistration";

export type CustomEventName = "BrainVizPlay";

export type EventName = StandardEventName | CustomEventName;

/**
 * Aggregated Event Measurement priority order (iOS 14.5+).
 * Meta caps each verified domain at 8 prioritized events.
 * Index 0 = highest priority.
 */
export const AEM_PRIORITY: readonly string[] = [
  "Lead.investor_accredited",
  "Lead.investor_unverified",
  "Lead.collaborator",
  "Lead.general_contact",
  "Subscribe",
  "BrainVizPlay",
  "ViewContent.invest_public",
  "ViewContent.build_collaborator",
] as const;

/** Per-page ViewContent payload. /investor-pitch/* deliberately excluded. */
export const PAGE_CONTENT: Record<string, { name: string; category: string } | undefined> = {
  "/":              { name: "home",                category: "marketing" },
  "/architecture":  { name: "architecture",        category: "technical" },
  "/research":      { name: "research",            category: "technical" },
  "/invest":        { name: "invest_public",       category: "investor" },
  "/build":         { name: "build_collaborator",  category: "talent" },
  "/contact":       { name: "contact",             category: "general" },
  "/support":       { name: "support_tiers",       category: "donation" },
  "/privacy":       { name: "privacy",             category: "legal" },
  "/terms":         { name: "terms",               category: "legal" },
};

export type LeadType =
  | "investor_accredited"
  | "investor_unverified"
  | "investor_retail"
  | "collaborator"
  | "general_contact"
  | "supporter_wall";

/**
 * Placeholder LTVs in USD passed as `value` on Lead events so Meta's optimizer
 * can rank conversions. NOT real money; never user-facing.
 */
export const LEAD_VALUE: Record<LeadType, number> = {
  investor_accredited: 50000,
  investor_unverified: 5000,
  investor_retail:     100,
  collaborator:        5000,
  general_contact:     500,
  supporter_wall:      50,
};

/** Mapping from the /invest form's `accreditation` field to lead segment. */
export function accreditationToLeadType(
  accreditation: string | null | undefined,
): "investor_accredited" | "investor_unverified" | "investor_retail" {
  if (accreditation === "yes") return "investor_accredited";
  if (accreditation === "not-sure") return "investor_unverified";
  return "investor_retail";
}

export function pathToContent(pathname: string) {
  const clean = pathname.replace(/\/$/, "") || "/";
  return PAGE_CONTENT[clean];
}

/** Returns true if this path should fire any Meta/GTM events at all. */
export function pathIsTracked(pathname: string): boolean {
  if (pathname.startsWith("/investor-pitch")) return false;
  return true;
}
