/**
 * First-touch UTM attribution + referrer capture.
 *
 * Runs on every page load (via Base.astro). Captures utm_* params and the
 * landing referrer into sessionStorage so they survive multi-page browsing
 * before a user submits a form. First-touch wins. we never overwrite once set.
 *
 * Also captures ad click ids (rdt_cid, ttclid, fbclid, gclid) into the same
 * store so forms and the conversion server legs can forward them.
 *
 * Exposes window.injectAttribution(form) for form submit handlers and
 * window.oscenClickIds() for the conversion fan-out in forms.ts.
 */

import { CLICK_ID_KEYS, type ClickIdKey } from "../lib/ad-events";

const STORAGE_KEY = "oscen_attribution";

type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  // Ad platform click ids (Reddit, TikTok, Meta, Google). First value wins.
  rdt_cid?: string;
  ttclid?: string;
  fbclid?: string;
  gclid?: string;
  referrer?: string;
  landing_page?: string;
  landed_at?: string;
};

function readStored(): Attribution {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Click ids are bounded so a crafted URL cannot stuff sessionStorage or the CRM. */
function cleanClickId(v: string | null): string | undefined {
  if (!v) return undefined;
  const t = v.trim();
  return t && t.length <= 512 && /^[A-Za-z0-9._~-]+$/.test(t) ? t : undefined;
}

function write(a: Attribution) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch {
    // sessionStorage may be unavailable (private mode, etc.). fail silent
  }
}

function capture() {
  const stored = readStored();
  const params = new URLSearchParams(window.location.search);

  if (stored.landed_at) {
    // UTMs stay first-touch, but a click id that arrives later in the same
    // session (second ad click) is still recorded if none was captured yet.
    let changed = false;
    for (const key of CLICK_ID_KEYS) {
      const v = cleanClickId(params.get(key));
      if (v && !stored[key]) {
        stored[key] = v;
        changed = true;
      }
    }
    if (changed) write(stored);
    return;
  }

  const attribution: Attribution = {
    landing_page: window.location.pathname,
    landed_at: new Date().toISOString(),
  };

  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const) {
    const v = params.get(key);
    if (v) attribution[key] = v;
  }
  for (const key of CLICK_ID_KEYS) {
    const v = cleanClickId(params.get(key));
    if (v) attribution[key] = v;
  }

  const ref = document.referrer;
  if (ref && !ref.includes(window.location.host)) {
    attribution.referrer = ref;
  }

  write(attribution);
}

function injectAttribution(form: HTMLFormElement) {
  const stored = readStored();
  for (const [key, value] of Object.entries(stored)) {
    if (!value) continue;
    let input = form.querySelector<HTMLInputElement>(`input[name="${key}"]`);
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      form.appendChild(input);
    }
    input.value = String(value);
  }
}

/** Captured click ids, for the ad conversion server legs (forms.ts). */
function getClickIds(): Partial<Record<ClickIdKey, string>> {
  const stored = readStored();
  const out: Partial<Record<ClickIdKey, string>> = {};
  for (const key of CLICK_ID_KEYS) if (stored[key]) out[key] = stored[key];
  return out;
}

capture();

declare global {
  interface Window {
    injectAttribution: typeof injectAttribution;
    oscenClickIds: typeof getClickIds;
  }
}

window.injectAttribution = injectAttribution;
window.oscenClickIds = getClickIds;

export {};
