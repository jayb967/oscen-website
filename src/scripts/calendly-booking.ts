/**
 * Calendly intro-call picker for accredited investors on /invest.
 *
 * showCalendly() runs only after a successful "Yes, accredited" submission.
 * It loads Calendly's widget script on demand (nothing from Calendly loads for
 * anyone else), mounts the inline picker prefilled with the name + email they
 * just typed and the campaign UTMs, and listens for `calendly.event_scheduled`
 * to hand the booking to the CRM through /.netlify/functions/calendly-booked.
 * A direct link (also prefilled) covers blocked scripts.
 */

const BASE_URL = "https://calendly.com/rio-oscen/30min";
const WIDGET_SRC = "https://assets.calendly.com/assets/external/widget.js";
/** Display options from the founder's Calendly embed code. */
const DISPLAY = { hide_gdpr_banner: "1", primary_color: "0d4385" };

/** notes prefills the event's first custom question ("anything that will help prepare"). */
type Person = { name: string; email: string; notes?: string };
type Attribution = Partial<Record<"utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term" | "landing_page", string>>;

type CalendlyApi = {
  initInlineWidget: (opts: {
    url: string;
    parentElement: HTMLElement;
  }) => void;
};

function attribution(): Attribution {
  try {
    return JSON.parse(sessionStorage.getItem("oscen_attribution") || "{}") as Attribution;
  } catch {
    return {};
  }
}

/**
 * Calendly URL with display options, prefill (name, email) and campaign UTMs.
 * Prefill goes in the URL because the widget's own `prefill` option did not
 * reach the booking form in testing (2026-10-08); URL prefill is documented.
 * Empty values are omitted.
 */
function calendlyUrl(person: Person, a: Attribution): string {
  const params: [string, string | undefined][] = [
    ...Object.entries(DISPLAY),
    ["name", person.name],
    ["email", person.email],
    ["a1", person.notes?.slice(0, 1000)],
    ...(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const).map(
      (k) => [k, a[k]?.trim()] as [string, string | undefined],
    ),
  ];
  // encodeURIComponent (spaces as %20): Calendly shows "+" literally in prefilled
  // answers, which URLSearchParams would produce.
  const query = params
    .filter((p): p is [string, string] => !!p[1])
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `${BASE_URL}?${query}`;
}

let scriptPromise: Promise<CalendlyApi> | null = null;
function loadWidget(): Promise<CalendlyApi> {
  const existing = (window as unknown as { Calendly?: CalendlyApi }).Calendly;
  if (existing) return Promise.resolve(existing);
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = WIDGET_SRC;
    s.async = true;
    s.onload = () => {
      const api = (window as unknown as { Calendly?: CalendlyApi }).Calendly;
      api ? resolve(api) : reject(new Error("calendly_missing"));
    };
    s.onerror = () => reject(new Error("calendly_blocked"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

let listening = false;
function listenForBooking(person: Person, a: Attribution, onBooked: () => void) {
  if (listening) return;
  listening = true;
  window.addEventListener("message", (e: MessageEvent) => {
    if (e.origin !== "https://calendly.com") return;
    const data = e.data as { event?: string; payload?: { event?: { uri?: string }; invitee?: { uri?: string } } };
    if (data?.event !== "calendly.event_scheduled") return;
    onBooked();
    const eventUri = data.payload?.event?.uri;
    const inviteeUri = data.payload?.invitee?.uri;
    if (!eventUri || !inviteeUri) return;
    try {
      void fetch("/.netlify/functions/calendly-booked", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...a, name: person.name, email: person.email, event_uri: eventUri, invitee_uri: inviteeUri }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Calendly itself still has the booking; the CRM can be reconciled later.
    }
  });
}

/**
 * Mount the picker inside `root` (expects [data-calendly-mount], [data-calendly-fallback],
 * [data-calendly-booked] children). Safe to call more than once.
 */
export async function showCalendly(root: HTMLElement, person: Person): Promise<void> {
  const mount = root.querySelector<HTMLElement>("[data-calendly-mount]");
  const fallback = root.querySelector<HTMLAnchorElement>("[data-calendly-fallback]");
  const booked = root.querySelector<HTMLElement>("[data-calendly-booked]");
  if (!mount) return;
  const a = attribution();
  const url = calendlyUrl(person, a);
  if (fallback) fallback.href = url;
  root.classList.remove("hidden");

  listenForBooking(person, a, () => booked?.classList.remove("hidden"));

  if (mount.dataset.mounted === "1") return;
  try {
    const Calendly = await loadWidget();
    mount.dataset.mounted = "1";
    mount.querySelector("[data-calendly-loading]")?.remove();
    Calendly.initInlineWidget({ url, parentElement: mount });
  } catch {
    // Blocked or offline: the prefilled direct link below the frame still works.
    mount.querySelector("[data-calendly-loading]")?.replaceChildren(
      document.createTextNode("The calendar couldn't load here. Use the link below to pick a time."),
    );
  }
}
