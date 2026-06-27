/**
 * Consent state machine.
 *
 * Default state is DENIED everywhere, regardless of region. Tags only load
 * after the user grants consent through the CookieConsent banner.
 *
 * Region detection is timezone-based (no IP lookup, no third-party calls).
 * US/Canada -> "soft" banner copy. Everywhere else -> "strict" banner.
 *
 * Public API (window.oscenConsent):
 *   .state()                      -> "granted" | "denied" | "unknown"
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

function detectRegion(): ConsentRegion {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.startsWith("America/")) {
      // America/* covers US + Canada + Latin America. We classify Canada
      // as "us" for banner purposes (CCPA-like opt-out posture works for
      // both); rest of Americas get the strict banner.
      if (
        tz.startsWith("America/Toronto") ||
        tz.startsWith("America/Vancouver") ||
        tz.startsWith("America/Edmonton") ||
        tz.startsWith("America/Winnipeg") ||
        tz.startsWith("America/Halifax") ||
        tz.startsWith("America/St_Johns") ||
        tz === "America/Argentina/Buenos_Aires"
      ) {
        return tz === "America/Argentina/Buenos_Aires" ? "intl" : "us";
      }
      return "us";
    }
    return "intl";
  } catch {
    return "intl";
  }
}

const state = {
  current: readCookie(),
  region: detectRegion(),
};

function dispatch(name: "consent:granted" | "consent:denied") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail: { state: state.current } }));
}

function grant() {
  if (state.current === "granted") return;
  state.current = "granted";
  writeCookie("granted");
  dispatch("consent:granted");
}

function deny() {
  if (state.current === "denied") return;
  state.current = "denied";
  writeCookie("denied");
  dispatch("consent:denied");
}

function clear() {
  state.current = "unknown";
  clearCookie();
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
  // Returning user: emit the granted/denied event on next tick so scripts that
  // loaded after consent.ts (meta-pixel, gtm) can still hear the initial state.
  if (state.current === "granted") {
    queueMicrotask(() => dispatch("consent:granted"));
  } else if (state.current === "denied") {
    queueMicrotask(() => dispatch("consent:denied"));
  }
}

export type OscenConsent = typeof api;
export default api;
