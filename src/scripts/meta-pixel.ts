/**
 * Meta Pixel base loader for oscen.ai.
 *
 * Loaded on every page via Base.astro. Defines window.metaTrack synchronously
 * so callers (Hero.astro, forms.ts) never crash, but defers loading fbevents.js
 * until consent is granted. Pre-consent metaTrack calls are queued and replayed
 * once the pixel boots. Pairs with the CAPI server route via eventID dedupe.
 */

import {
  pathIsTracked,
  pathToContent,
  type EventName,
} from "../lib/meta-events";

type QueuedCall = {
  eventName: EventName;
  params?: Record<string, unknown>;
  eventId?: string;
};

const CUSTOM_EVENTS: ReadonlySet<string> = new Set(["BrainVizPlay"]);

const queue: QueuedCall[] = [];
let canFire = false;
let booted = false;

function readCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function metaGetFbp(): string | null {
  return readCookie("_fbp");
}

function metaGetFbc(): string | null {
  return readCookie("_fbc");
}

function fireEvent(call: QueuedCall) {
  const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
  if (!fbq || !canFire) return;
  const method = CUSTOM_EVENTS.has(call.eventName) ? "trackCustom" : "track";
  const params = call.params || {};
  if (call.eventId) {
    fbq(method, call.eventName, params, { eventID: call.eventId });
  } else {
    fbq(method, call.eventName, params);
  }
}

function metaTrack(
  eventName: EventName,
  params?: Record<string, unknown>,
  eventId?: string,
) {
  // Hard drop if the user has explicitly denied consent: never queue.
  if (typeof window !== "undefined" && window.oscenConsent?.state() === "denied") {
    return;
  }
  if (!booted || !canFire) {
    queue.push({ eventName, params, eventId });
    return;
  }
  fireEvent({ eventName, params, eventId });
}

function injectPixelScript() {
  // Official Meta Pixel base snippet, hand-translated to TS.
  const w = window as unknown as {
    fbq?: ((...args: unknown[]) => void) & {
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[];
      loaded?: boolean;
      version?: string;
      push?: (...args: unknown[]) => void;
    };
    _fbq?: unknown;
  };
  if (w.fbq) return;
  const n: ((...args: unknown[]) => void) & {
    callMethod?: (...args: unknown[]) => void;
    queue: unknown[];
    loaded: boolean;
    version: string;
    push?: (...args: unknown[]) => void;
  } = function (...args: unknown[]) {
    if (n.callMethod) {
      n.callMethod(...args);
    } else {
      n.queue.push(args);
    }
  } as never;
  n.push = n;
  n.loaded = true;
  n.version = "2.0";
  n.queue = [];
  w.fbq = n;
  w._fbq = n;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  const first = document.getElementsByTagName("script")[0];
  first?.parentNode?.insertBefore(script, first);
}

function bootPixel(pixelId: string) {
  if (booted) return;
  if ((window as unknown as { __oscenMetaPixelBooted?: boolean }).__oscenMetaPixelBooted) {
    booted = true;
    canFire = true;
    return;
  }
  (window as unknown as { __oscenMetaPixelBooted?: boolean }).__oscenMetaPixelBooted = true;

  injectPixelScript();
  const fbq = (window as unknown as { fbq: (...args: unknown[]) => void }).fbq;
  fbq("init", pixelId);
  fbq("track", "PageView");

  const content = pathToContent(window.location.pathname);
  if (content) {
    fbq("track", "ViewContent", {
      content_name: content.name,
      content_category: content.category,
    });
  }

  booted = true;
  canFire = true;

  while (queue.length > 0) {
    const call = queue.shift();
    if (call) fireEvent(call);
  }
}

declare global {
  interface Window {
    metaTrack: typeof metaTrack;
    metaGetFbp: typeof metaGetFbp;
    metaGetFbc: typeof metaGetFbc;
    __oscenMetaPixelBooted?: boolean;
    oscenConsent?: {
      state: () => "granted" | "denied" | "unknown";
      region: () => "us" | "intl";
      grant: () => void;
      deny: () => void;
      onChange: (handler: (s: "granted" | "denied" | "unknown") => void) => () => void;
    };
  }
}

if (typeof window !== "undefined") {
  window.metaTrack = metaTrack;
  window.metaGetFbp = metaGetFbp;
  window.metaGetFbc = metaGetFbc;

  (function init() {
    const enabled = import.meta.env.PUBLIC_META_PIXEL_ENABLED;
    const pixelId = import.meta.env.PUBLIC_META_PIXEL_ID as string | undefined;

    if (enabled !== "true" || !pixelId) return;
    if (!pathIsTracked(window.location.pathname)) return;

    const consent = window.oscenConsent;
    if (consent && consent.state() === "granted") {
      bootPixel(pixelId);
    }
    // Listen unconditionally (not { once: true }) so that revoke -> re-grant
    // works in the same session. If already booted, just re-enable firing.
    window.addEventListener("consent:granted", () => {
      if (booted) {
        canFire = true;
      } else {
        bootPixel(pixelId);
      }
    });

    window.addEventListener("consent:denied", () => {
      canFire = false;
      // Drop anything queued: a denied user should never see those events flush
      // if they later re-grant. They are a separate session of consent.
      queue.length = 0;
    });
  })();
}

export {};
