/**
 * Shared hardening for the ad conversion server legs (reddit-capi.ts,
 * tiktok-events.ts). Deliberately stricter than meta-capi.ts (PROGRESS M3):
 *
 *  - POST only, and only from an allowed Origin (oscen.ai, www, this site's own
 *    Netlify URL / deploy preview, localhost under netlify dev). No Origin =
 *    rejected. Origin is forgeable outside a browser, so this plus the rate
 *    limit and the event allowlist bound abuse; they do not authenticate.
 *  - The event comes from the URL route, checked against a fixed allowlist
 *    (ad-events.ts CONVERSION_KINDS). Callers cannot name arbitrary events.
 *  - Body capped at 4 KB, every field type-checked and length-bounded.
 *  - Per-IP rate limit (per warm instance; best-effort, like inquiry.ts).
 *  - Upstream response bodies are logged server-side only, never returned.
 *    Clients only ever see { ok } or a short generic reason.
 *  - Unconfigured = 200 { ok: false, reason: "not_configured" } with no env
 *    names, so the page never errors and nothing about config leaks.
 */

import { createHash } from "node:crypto";
import { isConversionKind, type ConversionKind } from "../../src/lib/ad-events";

export type HandlerEvent = {
  path: string;
  httpMethod: string;
  body: string | null;
  headers: Record<string, string | undefined>;
};

export type HandlerResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

/** Validated, normalized input shared by both platforms. */
export type AdConversion<K extends string = ConversionKind> = {
  kind: K;
  eventId: string;
  sourceUrl?: string;
  referrer?: string;
  email?: string;
  value?: number;
  currency?: string;
  clickId?: string;
  /** Platform first-party cookie (_rdt_uuid or _ttp). */
  browserId?: string;
  ip?: string;
  userAgent?: string;
};

export const MAX_BODY_BYTES = 4096;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const ipHits = new Map<string, number[]>();

const ALLOWED_ORIGINS = ["https://oscen.ai", "https://www.oscen.ai"];

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // This site's own Netlify URLs (prod + deploy previews), not any *.netlify.app.
  for (const v of [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL]) {
    if (v && safeOrigin(v) === origin) return true;
  }
  if (process.env.NETLIFY_DEV === "true" && /^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

export function corsHeaders(origin: string | undefined): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin! : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function json(status: number, body: unknown, origin: string | undefined): HandlerResponse {
  return {
    statusCode: status,
    headers: {
      "content-type": "application/json",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
      ...corsHeaders(origin),
    },
    body: JSON.stringify(body),
  };
}

/** Bounded string field reader, exported for platform-specific fields. */
export function boundedStr(v: unknown, max: number, pattern?: RegExp): string | undefined {
  return str(v, max, pattern);
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Lowercase + trim, then SHA-256. Returns undefined for anything not email-shaped. */
export function hashEmail(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const e = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? sha256(e) : undefined;
}

export function clientIp(headers: Record<string, string | undefined>): string | undefined {
  // Netlify's own header is the real TCP source and cannot be spoofed.
  const nf = headers["x-nf-client-connection-ip"];
  if (nf) return nf;
  return headers["x-forwarded-for"]?.split(",")[0]?.trim() || undefined;
}

export function rateLimited(ip: string | undefined): boolean {
  const key = ip || "unknown";
  const now = Date.now();
  const hits = (ipHits.get(key) || []).filter((t) => t > now - RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  ipHits.set(key, hits);
  if (ipHits.size > 5000) ipHits.clear();
  return hits.length > RATE_LIMIT_MAX;
}

function str(v: unknown, max: number, pattern?: RegExp): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t || t.length > max) return undefined;
  if (pattern && !pattern.test(t)) return undefined;
  return t;
}

function routeOf(path: string, fnName: string): string {
  const parts = path.split("/").filter(Boolean);
  const idx = parts.indexOf(fnName);
  return idx >= 0 ? parts.slice(idx + 1).join("/") : parts[parts.length - 1] || "";
}

const TOKEN = /^[A-Za-z0-9._~-]+$/;

/**
 * Runs every shared check. Returns either a finished response (reject /
 * not configured) or the validated conversion for the platform sender.
 */
export function parseRequest<K extends string = ConversionKind>(
  event: HandlerEvent,
  fnName: string,
  configured: boolean,
  /** Route allowlist; defaults to the shared conversion kinds. */
  isKind: (k: string) => k is K = isConversionKind as unknown as (k: string) => k is K,
): { response: HandlerResponse } | { conversion: AdConversion<K>; origin: string; body: Record<string, unknown> } {
  const origin = event.headers["origin"] || event.headers["Origin"];

  if (event.httpMethod === "OPTIONS") {
    return { response: { statusCode: 204, headers: corsHeaders(origin), body: "" } };
  }
  if (event.httpMethod !== "POST") return { response: json(405, { ok: false }, origin) };
  if (!isAllowedOrigin(origin)) return { response: json(403, { ok: false }, origin) };
  if (!configured) return { response: json(200, { ok: false, reason: "not_configured" }, origin) };

  const ip = clientIp(event.headers);
  if (rateLimited(ip)) return { response: json(429, { ok: false }, origin) };

  const kind = routeOf(event.path || "", fnName);
  if (!isKind(kind)) return { response: json(404, { ok: false }, origin) };

  const raw = event.body || "";
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return { response: json(413, { ok: false }, origin) };
  }
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed;
  } catch {
    return { response: json(400, { ok: false }, origin) };
  }

  const eventId = str(body.event_id, 64, TOKEN);
  if (!eventId) return { response: json(400, { ok: false }, origin) };

  const value =
    typeof body.value === "number" && Number.isFinite(body.value) && body.value >= 0 && body.value <= 1_000_000
      ? body.value
      : undefined;

  const sourceUrl = str(body.event_source_url, 1024);
  const ua = event.headers["user-agent"] || event.headers["User-Agent"];

  return {
    origin: origin!,
    // Raw parsed body (already size-capped) for platform-specific fields.
    // Callers must type-check and bound anything they read from it.
    body,
    conversion: {
      kind,
      eventId,
      // Only our own pages count as a source URL.
      sourceUrl: sourceUrl && isAllowedOrigin(safeOrigin(sourceUrl)) ? sourceUrl : undefined,
      referrer: str(body.referrer, 1024),
      // meta-capi's client contract sends the email as user_data.em.
      email: str(body.email ?? (body.user_data as { em?: unknown } | undefined)?.em, 254),
      value,
      currency: value !== undefined ? str(body.currency, 3, /^[A-Z]{3}$/) || "USD" : undefined,
      // Each leg sends its own platform's ids under these neutral names.
      clickId: str(body.click_id, 512, TOKEN),
      browserId: str(body.browser_id, 256, /^[A-Za-z0-9._~:|-]+$/),
      ip,
      userAgent: ua ? ua.slice(0, 512) : undefined,
    },
  };
}

function safeOrigin(u: string): string | undefined {
  try {
    return new URL(u).origin;
  } catch {
    return undefined;
  }
}

/** POST JSON upstream with a 5 s timeout. Body is for server logs only. */
export async function postUpstream(
  url: string,
  headers: Record<string, string>,
  payload: unknown,
): Promise<{ ok: boolean; status: number; body: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body: text.slice(0, 2000) };
  } finally {
    clearTimeout(timer);
  }
}
