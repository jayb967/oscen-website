/**
 * Live offer state on /support, read from the CRM's public status endpoint.
 *
 *  - Real remaining counts replace the static scarcity lines.
 *  - A tier that hit its cap turns into a "claimed" card (no link) instead of
 *    vanishing, so the sell-out itself is visible and true.
 *  - The recent-backers ticker shows only once there are MIN_PROOF real
 *    backers. Small numbers never headline; invented ones never exist.
 *  - The First in Line confirmed total shows only from MIN_LINE people up.
 *
 * Every number here comes from real purchases. If the fetch fails, the page
 * keeps its static copy, which is also true ("100 made", "8 calls a month").
 */
import { TIER_NAMES } from "../lib/support";

const STATUS_URL =
  import.meta.env.PUBLIC_SUPPORT_STATUS_URL ?? "https://crm.oscen.ai/api/public/support-status";

/** Below this many real backers, lead with the cap instead of the count. */
const MIN_PROOF = 5;
/** First in Line: the confirmed total shows only from this many people up. */
const MIN_LINE = 25;

type Capped = { cap: number; sold: number; remaining: number; open: boolean; period?: string; taken?: string[] };
type Status = {
  tiers: Partial<{
    founding: Capped;
    region: Capped;
    office: Capped;
    labday: Capped;
    holiday: { open: boolean; closesAt?: string };
  }>;
  /** displayName is null for anonymous or not-yet-approved buyers. */
  recent: { displayName: string | null; tier: string; foundingNumber?: number; at: string }[];
  backers: number;
  /** First in Line: confirmed places only. */
  line?: { total?: number };
};

function card(id: string) {
  return document.querySelector<HTMLAnchorElement>(`a[data-tier="${id}"]`);
}

function setScarcity(id: string, text: string) {
  const el = card(id)?.querySelector<HTMLElement>("[data-scarcity]");
  if (el) el.textContent = text;
}

/** Turn a sold-out card into a non-link that still shows what was claimed. */
function markClaimed(id: string, text: string, cta = "Claimed") {
  const el = card(id);
  if (!el) return;
  el.removeAttribute("href");
  el.setAttribute("aria-disabled", "true");
  el.classList.add("opacity-60", "pointer-events-none");
  setScarcity(id, text);
  const ctaEl = el.lastElementChild?.lastElementChild;
  if (ctaEl) ctaEl.textContent = cta;
}

function nextMonthName(period?: string) {
  const [y, m] = (period ?? "").split("-").map(Number);
  if (!y || !m) return "next month";
  return new Date(Date.UTC(y, m, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
}

function applyTiers(t: Status["tiers"]) {
  const f = t.founding;
  if (f) {
    if (!f.open && f.remaining <= 0) markClaimed("founding", `All ${f.cap} claimed. Never reprinted.`);
    else if (f.sold >= MIN_PROOF)
      setScarcity("founding", `${f.remaining} of ${f.cap} left. When they're gone, this tier closes.`);
  }

  const r = t.region;
  if (r) {
    if (!r.open && r.remaining <= 0) markClaimed("region", `All ${r.cap} regions are sponsored.`);
    else if (r.sold > 0) setScarcity("region", `${r.remaining} of ${r.cap} regions left. One sponsor each.`);
  }

  const o = t.office;
  if (o) {
    if (!o.open && o.remaining <= 0) markClaimed("office", `This month's spots are booked. Reopens ${nextMonthName(o.period)} 1.`, "Full this month");
    else setScarcity("office", `${o.remaining} of ${o.cap} calls left this month.`);
  }

  const l = t.labday;
  if (l) {
    if (!l.open && l.remaining <= 0) markClaimed("labday", `${l.period ?? "This year"} is fully booked.`, "Fully booked");
    else setScarcity("labday", `${l.remaining} of ${l.cap} left for ${l.period ?? "this year"}.`);
  }

  const holiday = card("holiday");
  if (t.holiday && !t.holiday.open && holiday) (holiday.closest("[data-tier-wrap]") ?? holiday).remove();
}

function timeAgo(iso: string) {
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function renderTicker(s: Status) {
  const root = document.getElementById("backers-ticker");
  const list = document.getElementById("backers-ticker-list");
  const count = document.getElementById("backers-ticker-count");
  if (!root || !list || !count) return;
  const recent = (s.recent ?? []).filter((r) => r && r.at).slice(0, 6);
  if (s.backers < MIN_PROOF || recent.length === 0) return;

  for (const r of recent) {
    const li = document.createElement("li");
    li.className = "flex items-baseline gap-2 text-xs text-text-secondary";
    const what = r.foundingNumber
      ? `Founding #${String(r.foundingNumber).padStart(3, "0")}`
      : r.tier === "custom"
      ? "the brain"
      : TIER_NAMES[r.tier as keyof typeof TIER_NAMES] ?? "the brain";
    const who = document.createElement("span");
    who.className = "text-text-primary";
    who.textContent = r.displayName?.trim() || "A new backer"; // textContent: no HTML injection.
    const rest = document.createElement("span");
    rest.textContent = `backed ${what}`;
    const when = document.createElement("span");
    when.className = "text-[10px] font-tech text-text-muted";
    when.textContent = timeAgo(r.at);
    li.append(who, rest, when);
    list.appendChild(li);
  }
  count.textContent = `${s.backers} backers so far`;
  root.classList.remove("hidden");
}

function renderLineTotal(line: Status["line"]) {
  const el = document.getElementById("line-total");
  const total = Number(line?.total);
  if (!el || !Number.isInteger(total) || total < MIN_LINE) return;
  el.textContent = `${total.toLocaleString("en-US")} people have confirmed their place in line.`;
  el.classList.remove("hidden");
}

export async function loadSupportStatus() {
  try {
    const res = await fetch(STATUS_URL, { headers: { Accept: "application/json" } });
    if (!res.ok) return;
    const s = (await res.json()) as Status;
    if (!s || typeof s !== "object" || !s.tiers) return;
    const backers = Number(s.backers) || 0;
    applyTiers(s.tiers);
    renderTicker({ ...s, backers });
    renderLineTotal(s.line);
  } catch {
    // Static copy stays; it is true on its own.
  }
}
