/**
 * Platform gate for UI placement (macOS overlay TitleBar vs native titlebar).
 * UA sniffing is deliberate: it is synchronous, so it can gate the render
 * tree — Tauri's plugin-os platform() is async and effect-bound — and the
 * lazy evaluation lets tests stub navigator.userAgent before render.
 * Caveat: desktop-class Safari on iPadOS also carries "Macintosh" (the strip
 * would render there); the window mutation itself is guarded separately by
 * the runtime check in useAlwaysOnTop, not by platform.
 */
export function isMacPlatform(): boolean {
  return /Macintosh|MacIntel|Mac OS X/i.test(navigator.userAgent);
}
