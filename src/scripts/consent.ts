/**
 * Consent state machine.
 *
 * Two models, by region (founder decision 2026-10-08):
 *   - US: OPT-OUT. With no saved choice, ad tags load ("implied" consent)
 *     unless the browser sends Global Privacy Control, which counts as an
 *     opt-out (CCPA/CPRA). Visitors opt out through the footer "Do not sell or
 *     share my personal information" link or the cookie preferences banner.
 *   - Everywhere else: OPT-IN. Nothing loads until the visitor clicks Accept.
 *
 * Region detection is timezone-based (no IP lookup, no third-party calls)
 * and deliberately narrow: only US timezones count as "us". Canada, Latin
 * America and everyone else get the opt-in model.
 *
 * Public API (window.oscenConsent):
 *   .state()                      -> "granted" | "denied" | "unknown" (effective)
 *   .decided()                    -> true once the visitor saved a choice
 *   .region()                     -> "us" | "intl"
 *   .grant()                      -> persists granted, dispatches consent:granted
 *   .deny()                       -> persists denied, dispatches consent:denied
 *   .clear()                      -> wipes cookie so the banner reappears
 *   .onChange(handler)            -> subscribe to consent:granted / consent:denied
 *
 * Other scripts (meta-pixel.ts, gtm.ts) MUST gate all loading on
 * consent === "granted" via the window event or by checking state().
 */

const COOKIE_NAME = "oscen_consent";
const COOKIE_MAX_AGE_DAYS = 365;
const COOKIE_DENY_MAX_AGE_DAYS = 90;

export type ConsentState = "granted" | "denied" | "unknown";
export type ConsentRegion = "us" | "intl";

function readCookie(): ConsentState {
  if (typeof document === "undefined") return "unknown";
  const match = document.cookie.match(new RegExp("(?:^|; )" + COOKIE_NAME + "=([^;]*)"));
  if (!match) return "unknown";
  const v = decodeURIComponent(match[1]);
  if (v === "granted" || v === "denied") return v;
  return "unknown";
}

function writeCookie(value: "granted" | "denied") {
  if (typeof document === "undefined") return;
  const maxAge =
    (value === "granted" ? COOKIE_MAX_AGE_DAYS : COOKIE_DENY_MAX_AGE_DAYS) * 24 * 60 * 60;
  document.cookie =
    `${COOKIE_NAME}=${value}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

function clearCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=; max-age=0; path=/; SameSite=Lax`;
}

/** IANA zones used in the 50 states + DC (incl. legacy US/* aliases). */
const US_ZONES = new Set([
  "America/New_York", "America/Detroit", "America/Chicago", "America/Denver",
  "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "America/Juneau",
  "America/Sitka", "America/Metlakatla", "America/Yakutat", "America/Nome",
  "America/Adak", "America/Boise", "America/Menominee", "America/Fort_Wayne",
  "America/Indianapolis", "America/Louisville", "Pacific/Honolulu",
]);
const US_ZONE_PREFIXES = ["America/Indiana/", "America/Kentucky/", "America/North_Dakota/", "US/"];

function detectRegion(): ConsentRegion {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (US_ZONES.has(tz) || US_ZONE_PREFIXES.some((p) => tz.startsWith(p))) return "us";
    return "intl";
  } catch {
    return "intl";
  }
}

/** Global Privacy Control: a legally binding opt-out signal in California. */
function gpcOptOut(): boolean {
  try {
    return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  } catch {
    return false;
  }
}

/** Effective state when the visitor has not saved a choice. */
function impliedState(region: ConsentRegion): ConsentState {
  if (region !== "us") return "unknown";
  return gpcOptOut() ? "denied" : "granted";
}

const saved = readCookie();
const region = detectRegion();
const state = {
  current: saved === "unknown" ? impliedState(region) : saved,
  decided: saved !== "unknown",
  region,
};

function dispatch(name: "consent:granted" | "consent:denied") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail: { state: state.current } }));
}

function grant() {
  const changed = state.current !== "granted";
  state.current = "granted";
  state.decided = true;
  writeCookie("granted");
  if (changed) dispatch("consent:granted");
}

function deny() {
  const changed = state.current !== "denied";
  state.current = "denied";
  state.decided = true;
  writeCookie("denied");
  // Tags that already loaded stay in memory until the next page load; the
  // saved "denied" stops them from loading again on every later page.
  if (changed) dispatch("consent:denied");
}

/** Forget the saved choice (reopens the banner). Falls back to the region default. */
function clear() {
  clearCookie();
  state.decided = false;
  state.current = impliedState(state.region);
}

function onChange(handler: (s: ConsentState) => void) {
  if (typeof window === "undefined") return () => {};
  const onGrant = () => handler("granted");
  const onDeny = () => handler("denied");
  window.addEventListener("consent:granted", onGrant);
  window.addEventListener("consent:denied", onDeny);
  return () => {
    window.removeEventListener("consent:granted", onGrant);
    window.removeEventListener("consent:denied", onDeny);
  };
}

const api = {
  state: () => state.current,
  decided: () => state.decided,
  region: () => state.region,
  grant,
  deny,
  clear,
  onChange,
};

declare global {
  interface Window {
    oscenConsent: typeof api;
  }
}

if (typeof window !== "undefined") {
  window.oscenConsent = api;
  // Saved or implied state: emit the granted/denied event on next tick so
  // scripts that loaded after consent.ts (pixels, gtm) hear the initial state.
  if (state.current === "granted") {
    queueMicrotask(() => dispatch("consent:granted"));
  } else if (state.current === "denied") {
    queueMicrotask(() => dispatch("consent:denied"));
  }
}

export type OscenConsent = typeof api;
export default api;
