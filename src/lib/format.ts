/**
 * Shared formatting utilities — used across multiple sections
 * to keep display logic DRY.
 */

/** Compact large numbers: 1190000000 → "1.19B" */
export function compactNumber(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toLocaleString();
}

/** Section label component markup (reused in every section) */
export function sectionLabel(text: string): string {
  return `<span class="text-[10px] font-mono text-text-muted uppercase tracking-[0.3em]">${text}</span>`;
}
