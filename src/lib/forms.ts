/**
 * Form config (build-time) + submit helpers (client-side).
 *
 * Endpoints and segment names are inlined at build via PUBLIC_* env vars.
 * Submit helpers are pure functions used by every form's <script> block so
 * we never repeat fetch / disable / status logic.
 *
 * On successful submit, helpers ALSO fire Meta Pixel + Conversions API +
 * GTM dataLayer events with a shared event_id so the browser and server
 * legs dedupe. All firing is gated on the helpers seeing window.metaTrack /
 * window.gtmPush (set by consent-gated scripts in Base.astro).
 *
 * Set in Netlify (or .env.local for dev):
 *   PUBLIC_BUTTONDOWN_USERNAME
 *   PUBLIC_FORMSPREE_INVESTOR_ID
 *   PUBLIC_FORMSPREE_BUILD_ID
 *   PUBLIC_FORMSPREE_CONTACT_ID
 */

import {
  accreditationToLeadType,
  LEAD_VALUE,
  type LeadType,
} from "./meta-events";

const env = import.meta.env;

const BUTTONDOWN_USERNAME = env.PUBLIC_BUTTONDOWN_USERNAME ?? "oscen";

export const BUTTONDOWN_ACTION =
  `https://buttondown.com/api/emails/embed-subscribe/${BUTTONDOWN_USERNAME}`;

export const FORMSPREE = {
  investor: `https://formspree.io/f/${env.PUBLIC_FORMSPREE_INVESTOR_ID ?? "mjgdnzjw"}`,
  build: `https://formspree.io/f/${env.PUBLIC_FORMSPREE_BUILD_ID ?? "mzdqnwyy"}`,
  contact: `https://formspree.io/f/${env.PUBLIC_FORMSPREE_CONTACT_ID ?? "xzdkgdol"}`,
};

export const SEGMENTS = {
  investorAccredited: "investor-accredited",
  investorUnverified: "investor-unverified",
  investorRetail: "investor-retail",
  collaboratorPending: "collaborator-pending",
  follower: "follower",
  supporterSpark: "supporter-spark",
  supporterSynapse: "supporter-synapse",
  supporterCortex: "supporter-cortex",
  supporterCustom: "supporter-custom",
} as const;

export const SUPPORTER_TAG_FOR_TIER: Record<string, string> = {
  spark:   SEGMENTS.supporterSpark,
  synapse: SEGMENTS.supporterSynapse,
  cortex:  SEGMENTS.supporterCortex,
  custom:  SEGMENTS.supporterCustom,
};

// ---------- conversion tracking ----------

const CAPI_BASE = "/.netlify/functions/meta-capi";

type TrackEventName = "Lead" | "Subscribe" | "CompleteRegistration";

type TrackConfig = {
  /** Pixel event to fire. */
  event: TrackEventName;
  /** CAPI route segment ("lead" | "subscribe" | "registration"). */
  route: "lead" | "subscribe" | "registration";
  /** Lead bucket for the value lookup; not used for Subscribe / CompleteRegistration. */
  leadType?: LeadType;
  /** Custom params merged into both the pixel event and the CAPI custom_data. */
  customData?: Record<string, unknown>;
};

function readFormString(form: HTMLFormElement, name: string): string | undefined {
  const raw = new FormData(form).get(name);
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

/** Investor form tracking config — accreditation field drives the segment. */
export function trackingForInvestor(form: HTMLFormElement): TrackConfig {
  const accreditation = readFormString(form, "accreditation");
  const leadType = accreditationToLeadType(accreditation);
  return {
    event: "Lead",
    route: "lead",
    leadType,
    customData: {
      lead_type: leadType,
      segment: leadType,
      check_size: readFormString(form, "check_size"),
    },
  };
}

export function trackingForCollaborator(form: HTMLFormElement): TrackConfig {
  return {
    event: "Lead",
    route: "lead",
    leadType: "collaborator",
    customData: {
      lead_type: "collaborator",
      role: readFormString(form, "role"),
    },
  };
}

export function trackingForContact(form: HTMLFormElement): TrackConfig {
  return {
    event: "Lead",
    route: "lead",
    leadType: "general_contact",
    customData: {
      lead_type: "general_contact",
      inquiry_type: readFormString(form, "type"),
    },
  };
}

export function trackingForNewsletter(form: HTMLFormElement): TrackConfig {
  return {
    event: "Subscribe",
    route: "subscribe",
    customData: {
      tag: readFormString(form, "tag") || "follower",
    },
  };
}

function generateEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function postCapiMirror(
  cfg: TrackConfig,
  eventId: string,
  email: string | undefined,
  extraCustom: Record<string, unknown>,
): Promise<void> {
  // Consent gate: server-side PII forwarding must respect the same opt-out
  // as the browser pixel. No granted consent = no email leaves the page.
  if (typeof window === "undefined" || window.oscenConsent?.state() !== "granted") {
    return;
  }
  try {
    await fetch(`${CAPI_BASE}/${cfg.route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event_id: eventId,
        event_source_url: window.location.href,
        user_data: email ? { em: email } : {},
        custom_data: { ...(cfg.customData || {}), ...extraCustom },
        fbp: readCookie("_fbp"),
        fbc: readCookie("_fbc"),
      }),
      keepalive: true,
    });
  } catch {
    // Server-side mirror is best-effort. Browser pixel already fired.
  }
}

function fireConversion(form: HTMLFormElement, cfg: TrackConfig): void {
  const eventId = generateEventId();
  const email = readFormString(form, "email");
  const valueParams: Record<string, unknown> = {};
  if (cfg.leadType && LEAD_VALUE[cfg.leadType] !== undefined) {
    valueParams.value = LEAD_VALUE[cfg.leadType];
    valueParams.currency = "USD";
  }
  const pixelParams = { ...(cfg.customData || {}), ...valueParams };

  if (typeof window.metaTrack === "function") {
    window.metaTrack(cfg.event, pixelParams, eventId);
  }
  if (typeof window.gtmPush === "function") {
    window.gtmPush(cfg.event.toLowerCase(), { ...pixelParams, event_id: eventId });
  }
  // Server-side mirror runs async; do not block the success handler.
  postCapiMirror(cfg, eventId, email, valueParams);
}

// ---------- client-side submit helpers ----------

/** Sets text + ok/error color + removes hidden. Layout classes (mt, center,
 *  font) stay on the element so each form can position its own status line. */
function showStatus(el: HTMLElement, message: string, kind: "ok" | "error") {
  el.textContent = message;
  el.classList.remove("hidden", "text-accent-blue", "text-accent-red");
  el.classList.add(kind === "ok" ? "text-accent-blue" : "text-accent-red");
}

async function withBusyButton<T>(btn: HTMLButtonElement, run: () => Promise<T>): Promise<T> {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Sending...";
  try {
    return await run();
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

/**
 * Buttondown's embed endpoint is cross-origin and returns no CORS headers,
 * so we fire as no-cors and trust the confirmation email to close the loop.
 * Pass tracking={trackingForNewsletter(form)} to fire Subscribe.
 */
export async function subscribeButtondown(
  form: HTMLFormElement,
  btn: HTMLButtonElement,
  status: HTMLElement,
  tracking?: TrackConfig,
) {
  window.injectAttribution?.(form);
  status.classList.add("hidden");
  await withBusyButton(btn, async () => {
    try {
      await fetch(form.action, { method: "POST", mode: "no-cors", body: new FormData(form) });
      if (tracking) fireConversion(form, tracking);
      form.reset();
      showStatus(status, "Check your inbox to confirm.", "ok");
    } catch {
      showStatus(status, "Network error. Please try again.", "error");
    }
  });
}

/**
 * Formspree returns JSON. On 2xx we hand off to onSuccess (used to swap the
 * form for a success card); on error we render the message in `status`.
 * Pass tracking={trackingForInvestor(form)} (or trackingForCollaborator /
 * trackingForContact) to fire Lead.
 */
export async function submitFormspree(
  form: HTMLFormElement,
  btn: HTMLButtonElement,
  status: HTMLElement,
  onSuccess: () => void,
  tracking?: TrackConfig,
) {
  window.injectAttribution?.(form);
  status.classList.add("hidden");
  await withBusyButton(btn, async () => {
    try {
      const res = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        if (tracking) fireConversion(form, tracking);
        onSuccess();
      } else {
        const data = await res.json().catch(() => ({}));
        showStatus(status, data?.errors?.[0]?.message || "Something went wrong. Please try again.", "error");
      }
    } catch {
      showStatus(status, "Network error. Please try again.", "error");
    }
  });
}

/** Standalone helper for surfaces that aren't form-submits (e.g., a click on
 *  a CTA that we want to count as a conversion). */
export function fireStandaloneConversion(
  cfg: TrackConfig,
  email?: string,
  extraCustom: Record<string, unknown> = {},
): void {
  const eventId = generateEventId();
  const valueParams: Record<string, unknown> = {};
  if (cfg.leadType && LEAD_VALUE[cfg.leadType] !== undefined) {
    valueParams.value = LEAD_VALUE[cfg.leadType];
    valueParams.currency = "USD";
  }
  const pixelParams = { ...(cfg.customData || {}), ...valueParams, ...extraCustom };

  if (typeof window.metaTrack === "function") {
    window.metaTrack(cfg.event, pixelParams, eventId);
  }
  if (typeof window.gtmPush === "function") {
    window.gtmPush(cfg.event.toLowerCase(), { ...pixelParams, event_id: eventId });
  }
  postCapiMirror(cfg, eventId, email, valueParams);
}
