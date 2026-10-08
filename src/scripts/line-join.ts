/**
 * First in Line, client side (markup in src/components/support/LineJoin.astro).
 *
 *  - ?ref=<code> is captured once and kept in sessionStorage, then sent with
 *    the join so the referrer moves up when this visitor confirms.
 *  - Joining posts JSON to the same-origin relay (netlify/functions/line-join),
 *    shows "You're #N in line", and stores the visitor's own code in
 *    localStorage so a return visit shows their live place from the CRM.
 *  - ?line=<code>&confirmed=1 (from the confirmation email) shows
 *    "Confirmed. You're #N."; ?line_error=1 shows a retry note.
 *  - A new join fires the same "subscribe" conversion as the newsletter,
 *    through the existing consent-gated fan-out (fireStandaloneConversion).
 *
 * Storage is best-effort (try/catch): blocked storage just means no memory.
 */
import { fireStandaloneConversion } from "../lib/forms";

const JOIN_URL = "/.netlify/functions/line-join";
const LINE_URL = (import.meta.env.PUBLIC_LINE_STATUS_URL ?? "https://crm.oscen.ai/api/public/line").replace(/\/+$/, "");
const SHARE_BASE = "https://oscen.ai/support?ref=";
const CODE_KEY = "oscen_line_code";
const REF_KEY = "oscen_line_ref";
const CODE = /^[A-Za-z0-9_-]{3,40}$/;
const SHARE_TEXT = "I just got my place in line for the OSCEN humanoid. Join free with my link:";

type Place = {
  ok?: boolean;
  position?: number;
  total?: number;
  code?: string;
  confirmed?: boolean;
  group?: string;
  referrals?: number;
  firstName?: string;
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

function store(kind: "local" | "session", key: string, value?: string | null): string | null {
  try {
    const s = kind === "local" ? window.localStorage : window.sessionStorage;
    if (value === undefined) return s.getItem(key);
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    // Storage blocked: no memory across visits, nothing else changes.
  }
  return null;
}

const validCode = (v: string | null | undefined): v is string => !!v && CODE.test(v);
const fmt = (n: number) => n.toLocaleString("en-US");

const form = $<HTMLFormElement>("line-form");
const submit = $<HTMLButtonElement>("line-submit");
const status = $<HTMLElement>("line-status");
const notice = $<HTMLElement>("line-notice");
const success = $<HTMLElement>("line-success");

function say(el: HTMLElement | null, text: string, tone: "ok" | "error") {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden", "text-accent-green", "text-accent-red");
  el.classList.add(tone === "ok" ? "text-accent-green" : "text-accent-red");
}

/** Show "your place" for a join result or a live lookup. */
function render(place: Place, opts: { justConfirmed?: boolean; returning?: boolean } = {}) {
  if (!form || !success) return;
  const pos = typeof place.position === "number" && place.position > 0 ? place.position : undefined;

  const eyebrow = $("line-eyebrow");
  const name = place.firstName?.trim();
  if (eyebrow) eyebrow.textContent = opts.returning && name ? `Welcome back, ${name}` : "Your place";

  const headline = $("line-position");
  if (headline) {
    headline.textContent = opts.justConfirmed
      ? pos ? `Confirmed. You're #${fmt(pos)}.` : "Confirmed. You're in line."
      : pos ? `You're #${fmt(pos)} in line` : "You're in line.";
  }
  const confirm = $("line-confirm");
  if (confirm) {
    confirm.textContent = place.confirmed
      ? "Your place is confirmed. Share your link to move up."
      : "Check your email to confirm your place.";
  }

  const group = $("line-group");
  if (group) {
    const backer = !!place.group && place.group !== "free";
    group.textContent = backer ? "You're a backer, so you're ahead of every free sign-up." : "";
    group.classList.toggle("hidden", !backer);
  }

  const refs = $("line-referrals");
  if (refs) {
    const n = typeof place.referrals === "number" ? place.referrals : 0;
    refs.textContent = n > 0 ? `${fmt(n)} ${n === 1 ? "friend has" : "friends have"} joined through your link.` : "";
    refs.classList.toggle("hidden", n <= 0);
  }

  const share = $("line-share");
  if (validCode(place.code)) {
    const url = SHARE_BASE + encodeURIComponent(place.code);
    const link = $<HTMLInputElement>("line-link");
    if (link) link.value = url;
    const x = $<HTMLAnchorElement>("line-share-x");
    if (x) x.href = `https://x.com/intent/post?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(url)}`;
    const reddit = $<HTMLAnchorElement>("line-share-reddit");
    if (reddit) reddit.href = `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent("Join the line for the OSCEN humanoid")}`;
    $("line-native-share")?.classList.toggle("hidden", typeof navigator.share !== "function");
    share?.classList.remove("hidden");
  } else {
    share?.classList.add("hidden");
  }

  form.classList.add("hidden");
  success.classList.remove("hidden");
}

function showForm() {
  success?.classList.add("hidden");
  form?.classList.remove("hidden");
}

async function lookup(code: string): Promise<Place | null | "gone"> {
  try {
    const res = await fetch(`${LINE_URL}/${encodeURIComponent(code)}`, { headers: { Accept: "application/json" } });
    if (res.status === 404) return "gone";
    if (!res.ok) return null;
    const data = (await res.json()) as Place;
    if (!data || data.ok === false) return "gone";
    return { ...data, code };
  } catch {
    return null;
  }
}

/** Capture ?ref and remember it for this session. */
function captureRef(): string | null {
  const fromUrl = new URLSearchParams(location.search).get("ref");
  if (validCode(fromUrl)) store("session", REF_KEY, fromUrl);
  const ref = store("session", REF_KEY);
  return validCode(ref) ? ref : null;
}

async function init() {
  const ref = captureRef();
  const own = store("local", CODE_KEY);
  const refInput = $<HTMLInputElement>("line-ref");
  if (refInput && ref && ref !== own) refInput.value = ref;

  const url = new URL(location.href);
  const fromEmail = url.searchParams.get("line");
  const justConfirmed = url.searchParams.get("confirmed") === "1";
  const lineError = url.searchParams.get("line_error") === "1";
  if (fromEmail || justConfirmed || lineError) {
    ["line", "confirmed", "line_error"].forEach((k) => url.searchParams.delete(k));
    history.replaceState(history.state, "", url.toString());
  }

  if (lineError) {
    say(notice, "That confirmation link didn't work, or it expired. Enter your email again and we'll send a fresh one.", "error");
  }

  const code = validCode(fromEmail) ? fromEmail : own;
  if (validCode(fromEmail)) store("local", CODE_KEY, fromEmail);
  if (!validCode(code) || lineError) return;

  const place = await lookup(code);
  if (place === "gone") {
    store("local", CODE_KEY, null);
    return;
  }
  if (place) {
    render(place, { justConfirmed: justConfirmed && place.confirmed !== false, returning: !justConfirmed });
    if (justConfirmed) document.getElementById("join")?.scrollIntoView({ block: "start" });
  }
}

async function join(e: SubmitEvent) {
  e.preventDefault();
  if (!form || !submit) return;
  const email = form.querySelector<HTMLInputElement>('input[name="email"]');
  if (email && !email.checkValidity()) {
    say(status, "Please enter a valid email address.", "error");
    email.focus();
    return;
  }
  window.injectAttribution?.(form);
  const body: Record<string, string> = {};
  new FormData(form).forEach((v, k) => {
    if (typeof v === "string") body[k] = v;
  });

  status?.classList.add("hidden");
  const label = submit.textContent;
  submit.disabled = true;
  submit.textContent = "Saving your place...";
  try {
    const res = await fetch(JOIN_URL, {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const msg =
        res.status === 429 ? "Too many tries. Give it a minute, then try again."
        : res.status === 400 ? "We couldn't save that. Check your email address and try again."
        : "Something went wrong on our side. Please try again, or write to info@oscen.ai.";
      say(status, msg, "error");
      (window as Window & { turnstile?: { reset: () => void } }).turnstile?.reset();
      return;
    }
    const place = (await res.json().catch(() => ({}))) as Place;
    const prior = store("local", CODE_KEY);
    if (validCode(place.code)) store("local", CODE_KEY, place.code);
    // One conversion per new place, not per repeat submit of the same email.
    if (!validCode(place.code) || place.code !== prior) {
      fireStandaloneConversion(
        { event: "Subscribe", route: "subscribe", customData: { tag: "first-in-line" } },
        body.email,
      );
    }
    render(place);
    success?.focus({ preventScroll: true });
  } catch {
    say(status, "Network error. Please try again.", "error");
  } finally {
    submit.disabled = false;
    submit.textContent = label;
  }
}

form?.addEventListener("submit", join);

$("line-reset")?.addEventListener("click", () => {
  store("local", CODE_KEY, null);
  notice?.classList.add("hidden");
  showForm();
  $<HTMLInputElement>("line-email")?.focus();
});

$("line-copy")?.addEventListener("click", async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  const link = $<HTMLInputElement>("line-link");
  if (!link?.value) return;
  try {
    await navigator.clipboard.writeText(link.value);
  } catch {
    link.select();
    document.execCommand?.("copy");
  }
  btn.textContent = "Copied";
  setTimeout(() => (btn.textContent = "Copy link"), 2000);
});

$("line-native-share")?.addEventListener("click", () => {
  const url = $<HTMLInputElement>("line-link")?.value;
  if (url && typeof navigator.share === "function") {
    navigator.share({ title: "OSCEN: First in Line", text: SHARE_TEXT, url }).catch(() => {});
  }
});

// Hero CTA: land on the form with the cursor in the email field.
document.querySelectorAll<HTMLAnchorElement>('[data-line-cta="join"]').forEach((a) =>
  a.addEventListener("click", () => {
    window.setTimeout(() => {
      if (success && !success.classList.contains("hidden")) success.focus({ preventScroll: true });
      else $<HTMLInputElement>("line-email")?.focus({ preventScroll: true });
    }, 450);
  }),
);

void init();
