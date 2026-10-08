/**
 * /support hero clip. Lazy, polite, and safe when the media is missing.
 *
 *  - The poster is probed first and attached only if it loads, so a 404 never
 *    paints a broken frame over the glow panel.
 *  - Reduced motion or Save-Data: poster only, the clip never downloads.
 *  - Otherwise the clip (preload="none") starts only while the frame is on
 *    screen, and pauses when it scrolls away or the tab is hidden.
 *  - If every <source> fails, the clip is hidden and the panel (or poster) stays.
 */

const video = document.querySelector<HTMLVideoElement>("[data-line-video]");

if (video) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData =
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  let posterOk = false;
  let failed = false;
  let inView = false;

  const show = () => video.classList.remove("opacity-0");

  const poster = video.dataset.poster;
  if (poster) {
    const img = new Image();
    img.onload = () => {
      posterOk = true;
      video.poster = poster;
      show();
    };
    img.src = poster;
  }

  if (!reduced && !saveData) {
    video.muted = true; // Autoplay policies need this set as a property too.

    const sources = video.querySelectorAll("source");
    const onFail = () => {
      failed = true;
      video.pause();
      if (!posterOk) video.classList.add("hidden");
    };
    sources[sources.length - 1]?.addEventListener("error", onFail);
    video.addEventListener("error", onFail);
    video.addEventListener("playing", show);

    const sync = () => {
      if (failed) return;
      if (inView && !document.hidden) video.play().catch(() => {});
      else video.pause();
    };

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        (entries) => {
          inView = entries.some((e) => e.isIntersecting);
          sync();
        },
        { threshold: 0.25 },
      ).observe(video);
    } else {
      inView = true;
      sync();
    }
    document.addEventListener("visibilitychange", sync);
  }
}
