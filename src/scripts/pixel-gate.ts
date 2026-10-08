/**
 * Shared consent gate for third-party ad pixels (Reddit, TikTok).
 *
 * Same contract as meta-pixel.ts: the track function exists synchronously so
 * callers never crash, nothing loads until consent is "granted", calls made
 * before boot are queued and replayed, a "denied" state drops calls and clears
 * the queue, and untracked paths (pathIsTracked) never boot at all.
 */

import { pathIsTracked } from "../lib/meta-events";

type Gate<C> = {
  /** PUBLIC_*_ENABLED === "true" and a pixel id is present. */
  enabled: boolean;
  pixelId: string | undefined;
  /** Inject the vendor script, init the pixel, fire page view + view content. */
  boot: (pixelId: string) => void;
  /** Send one queued or live call to the vendor. */
  fire: (call: C) => void;
};

export function consentGatedTracker<C>(gate: Gate<C>): (call: C) => void {
  const queue: C[] = [];
  let booted = false;
  let canFire = false;

  const active =
    typeof window !== "undefined" &&
    gate.enabled &&
    !!gate.pixelId &&
    pathIsTracked(window.location.pathname);

  if (!active) return () => {};

  const pixelId = gate.pixelId as string;

  const start = () => {
    if (booted) {
      canFire = true;
      return;
    }
    gate.boot(pixelId);
    booted = true;
    canFire = true;
    while (queue.length > 0) {
      const call = queue.shift();
      if (call) gate.fire(call);
    }
  };

  if (window.oscenConsent?.state() === "granted") start();
  // Unconditional listeners so revoke then re-grant in one session works.
  window.addEventListener("consent:granted", start);
  window.addEventListener("consent:denied", () => {
    canFire = false;
    queue.length = 0;
  });

  return (call: C) => {
    if (window.oscenConsent?.state() === "denied") return;
    if (!booted || !canFire) {
      queue.push(call);
      return;
    }
    gate.fire(call);
  };
}

export function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"),
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function injectScript(src: string) {
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  const first = document.getElementsByTagName("script")[0];
  if (first?.parentNode) first.parentNode.insertBefore(script, first);
  else document.head.appendChild(script);
}
