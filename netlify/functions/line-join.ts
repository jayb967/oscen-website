/**
 * First in Line relay: POST /.netlify/functions/line-join
 *
 * The /support join form posts here (no secret in the browser). We de-spam,
 * then forward server-side to the CRM's line endpoint
 * (`${origin of CRM_ENDPOINT}/api/line/join`, Bearer INQUIRY_SECRET), which
 * records the sign-up, assigns a place and a referral code, and sends the
 * confirmation email.
 *
 * Hardening mirrors inquiry.ts: origin allowlist, per-IP rate limit, 4 KB
 * cap, honeypot (`_gotcha` filled = pretend success, drop), Turnstile verify
 * when TURNSTILE_SECRET_KEY is set, and a field allowlist (anything else is
 * dropped). The browser only ever sees { ok, position, total, code,
 * confirmed, group }; upstream bodies and errors are never echoed.
 *
 * Env (server-only): CRM_ENDPOINT, INQUIRY_SECRET, TURNSTILE_SECRET_KEY (optional).
 */

import {
  MAX_BODY_BYTES,
  boundedStr,
  clientIp,
  isAllowedOrigin,
  json,
  rateLimited,
  type HandlerEvent,
  type HandlerResponse,
} from "../lib/ad-relay";
import { verifyTurnstile } from "../lib/turnstile";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Referral codes are short URL-safe tokens issued by the CRM. */
const CODE = /^[A-Za-z0-9_-]{3,40}$/;
const CLICK_ID = /^[A-Za-z0-9._~-]+$/;

/** Attribution keys injected by src/scripts/attribution.ts, forwarded as-is (bounded). */
const ATTRIBUTION_KEYS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "landing_page", "referrer",
] as const;
const CLICK_ID_KEYS = ["rdt_cid", "ttclid", "twclid", "fbclid", "gclid"] as const;

/** Anything the CRM sends back is reduced to exactly this shape. */
type JoinResult = {
  ok: true;
  position?: number;
  total?: number;
  code?: string;
  confirmed?: boolean;
  group?: string;
};

function count(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e9 ? v : undefined;
}

function pickResult(raw: unknown): JoinResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    ok: true,
    position: count(r.position),
    total: count(r.total),
    code: boundedStr(r.code, 40, CODE),
    confirmed: typeof r.confirmed === "boolean" ? r.confirmed : undefined,
    group: boundedStr(r.group, 32, /^[a-z0-9_-]+$/),
  };
}

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  const origin = event.headers["origin"] || event.headers["Origin"];
  if (event.httpMethod === "OPTIONS") return json(204, "", origin);
  if (event.httpMethod !== "POST") return json(405, { ok: false }, origin);
  if (!isAllowedOrigin(origin)) return json(403, { ok: false }, origin);

  const endpoint = process.env.CRM_ENDPOINT;
  const secret = process.env.INQUIRY_SECRET;
  let crmOrigin: string | undefined;
  try {
    crmOrigin = endpoint ? new URL(endpoint).origin : undefined;
  } catch {
    crmOrigin = undefined;
  }
  if (!crmOrigin || !secret) return json(503, { ok: false }, origin);

  const ip = clientIp(event.headers);
  if (rateLimited(ip)) return json(429, { ok: false }, origin);

  const raw = event.body || "";
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return json(413, { ok: false }, origin);
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed;
  } catch {
    return json(400, { ok: false }, origin);
  }

  // Honeypot: bots fill a hidden field humans never see. Pretend success, drop.
  if (typeof body._gotcha === "string" && body._gotcha.trim() !== "") {
    return json(200, { ok: true }, origin);
  }

  const token = typeof body["cf-turnstile-response"] === "string" ? (body["cf-turnstile-response"] as string) : "";
  if (!(await verifyTurnstile(token, ip))) return json(400, { ok: false, error: "captcha_failed" }, origin);

  const email = boundedStr(body.email, 254, EMAIL)?.toLowerCase();
  if (!email) return json(400, { ok: false, error: "invalid_email" }, origin);

  // Field allowlist: only these reach the CRM. Everything else is dropped.
  const payload: Record<string, string> = { email };
  // The CRM contract field is `name` (the form field is first_name).
  const firstName = boundedStr(body.first_name, 60);
  if (firstName) payload.name = firstName;
  const ref = boundedStr(body.ref, 40, CODE);
  if (ref) payload.ref = ref;
  for (const k of ATTRIBUTION_KEYS) {
    const v = boundedStr(body[k], 1024);
    if (v) payload[k] = v;
  }
  for (const k of CLICK_ID_KEYS) {
    const v = boundedStr(body[k], 512, CLICK_ID);
    if (v) payload[k] = v;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${crmOrigin}/api/line/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error(`line-join crm ${res.status}`);
      // A 4xx from the CRM is about the input (bad email, blocked domain); say so generically.
      const status = res.status === 429 ? 429 : res.status >= 400 && res.status < 500 ? 400 : 502;
      return json(status, { ok: false }, origin);
    }
    const data = (await res.json().catch(() => ({}))) as { ok?: unknown };
    if (data?.ok === false) return json(400, { ok: false }, origin);
    return json(200, pickResult(data), origin);
  } catch (err) {
    console.error("line-join network error", (err as Error)?.message);
    return json(503, { ok: false }, origin);
  } finally {
    clearTimeout(timer);
  }
};

export default handler;
