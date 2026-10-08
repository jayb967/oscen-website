/**
 * Cloudflare Turnstile server-side verification, shared by the form relays
 * (inquiry.ts, line-join.ts). Moved here unchanged from inquiry.ts.
 */

/**
 * Verify a Cloudflare Turnstile token server-side. Only enforced when
 * TURNSTILE_SECRET_KEY is set; if it is not configured we skip verification so
 * the relay keeps working without CAPTCHA (the honeypot + rate limiter + kill
 * switch still apply). Returns true = human/allowed, false = reject.
 */
export async function verifyTurnstile(token: string, ip: string | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured -> do not block
  if (!token) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: ctrl.signal,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false; // fail closed on network/timeout when CAPTCHA is configured
  } finally {
    clearTimeout(timer);
  }
}
