/**
 * Form config (build-time) + submit helpers (client-side).
 *
 * Endpoints and segment names are inlined at build via PUBLIC_* env vars.
 * Submit helpers are pure functions used by every form's <script> block so
 * we never repeat fetch / disable / status logic.
 *
 * Set in Netlify (or .env.local for dev):
 *   PUBLIC_BUTTONDOWN_USERNAME
 *   PUBLIC_FORMSPREE_INVESTOR_ID
 *   PUBLIC_FORMSPREE_BUILD_ID
 *   PUBLIC_FORMSPREE_CONTACT_ID
 */

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
} as const;

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
 */
export async function subscribeButtondown(
  form: HTMLFormElement,
  btn: HTMLButtonElement,
  status: HTMLElement,
) {
  window.injectAttribution?.(form);
  status.classList.add("hidden");
  await withBusyButton(btn, async () => {
    try {
      await fetch(form.action, { method: "POST", mode: "no-cors", body: new FormData(form) });
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
 */
export async function submitFormspree(
  form: HTMLFormElement,
  btn: HTMLButtonElement,
  status: HTMLElement,
  onSuccess: () => void,
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
