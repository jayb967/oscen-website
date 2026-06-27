/**
 * Google Tag Manager container loader.
 *
 * Gated on consent === "granted". Pre-consent gtmPush() calls queue and drain
 * once GTM boots. Post-consent denial stops further pushes but does not unload
 * the already-injected script (GTM has no clean teardown).
 *
 * Public API (window.gtmPush): (event, params?) -> void
 */

import { pathIsTracked, pathToContent } from "../lib/meta-events";

type GtmParams = Record<string, unknown>;
type QueuedEvent = { event: string; params?: GtmParams };

const CONTAINER_ID = import.meta.env.PUBLIC_GTM_CONTAINER_ID as string | undefined;
const ENABLED = import.meta.env.PUBLIC_GTM_ENABLED === "true";

declare global {
  interface Window {
    dataLayer: Array<Record<string, unknown>>;
    gtmPush: (event: string, params?: GtmParams) => void;
    __oscenGtmBooted?: boolean;
  }
}

if (typeof window !== "undefined") {
  window.dataLayer = window.dataLayer || [];

  const queue: QueuedEvent[] = [];
  let canFire = false;

  const noop = () => {};

  const pushNow = (event: string, params?: GtmParams) => {
    window.dataLayer.push({ event, ...(params || {}) });
  };

  const queuedPush = (event: string, params?: GtmParams) => {
    if (canFire) {
      pushNow(event, params);
    } else {
      queue.push({ event, params });
    }
  };

  const tracked = pathIsTracked(window.location.pathname);

  // Always define gtmPush so callers do not need to feature-detect. If GTM is
  // disabled or the path is untracked, calls become a no-op.
  if (!ENABLED || !CONTAINER_ID || !tracked) {
    window.gtmPush = noop;
  } else {
    window.gtmPush = queuedPush;

    const injectHeadScript = () => {
      const s = document.createElement("script");
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(CONTAINER_ID)}`;
      document.head.appendChild(s);
    };

    const injectNoscript = () => {
      const n = document.createElement("noscript");
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(CONTAINER_ID)}`;
      iframe.height = "0";
      iframe.width = "0";
      iframe.style.display = "none";
      iframe.style.visibility = "hidden";
      n.appendChild(iframe);
      document.body.appendChild(n);
    };

    const boot = () => {
      if (window.__oscenGtmBooted) return;
      window.__oscenGtmBooted = true;

      // GTM expects gtm.start and gtm.js in the dataLayer before its script runs.
      window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
      injectHeadScript();
      injectNoscript();

      canFire = true;

      pushNow("page_view", {
        page_path: window.location.pathname,
        page_title: document.title,
      });

      const content = pathToContent(window.location.pathname);
      if (content) {
        pushNow("view_content", {
          content_name: content.name,
          content_category: content.category,
        });
      }

      while (queue.length) {
        const q = queue.shift()!;
        pushNow(q.event, q.params);
      }
    };

    const onGranted = () => {
      canFire = true;
      boot();
    };

    const onDenied = () => {
      // Pre-boot: never load. Post-boot: stop pushing further events.
      canFire = false;
      queue.length = 0;
    };

    // Listen unconditionally (not { once: true }) so revoke -> re-grant works
    // in the same session. boot() is idempotent.
    window.addEventListener("consent:granted", onGranted);
    window.addEventListener("consent:denied", onDenied);
    if (window.oscenConsent && window.oscenConsent.state() === "granted") {
      onGranted();
    }
  }
}

export {};
