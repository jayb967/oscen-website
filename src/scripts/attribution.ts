/**
 * First-touch UTM attribution + referrer capture.
 *
 * Runs on every page load (via Base.astro). Captures utm_* params and the
 * landing referrer into sessionStorage so they survive multi-page browsing
 * before a user submits a form. First-touch wins — we never overwrite once set.
 *
 * Exposes window.injectAttribution(form) for form submit handlers.
 */

const STORAGE_KEY = "oscen_attribution";

type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
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

function capture() {
  const stored = readStored();
  if (stored.landed_at) return;

  const params = new URLSearchParams(window.location.search);
  const attribution: Attribution = {
    landing_page: window.location.pathname,
    landed_at: new Date().toISOString(),
  };

  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const) {
    const v = params.get(key);
    if (v) attribution[key] = v;
  }

  const ref = document.referrer;
  if (ref && !ref.includes(window.location.host)) {
    attribution.referrer = ref;
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // sessionStorage may be unavailable (private mode, etc.) — fail silent
  }
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

capture();

declare global {
  interface Window {
    injectAttribution: typeof injectAttribution;
  }
}

window.injectAttribution = injectAttribution;

export {};
