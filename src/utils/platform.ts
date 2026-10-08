/**
 * Platform gate for window chrome: macOS overlay TitleBar, Windows custom
 * (undecorated) titlebar, Linux native decorations.
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

/**
 * True on Windows, which runs undecorated (tauri.windows.conf.json:
 * `decorations: false` + `shadow: true`) and therefore draws its own titlebar
 * strip with the window controls (see components/TitleBar). Linux keeps the
 * native title bar and hosts the pin in the sidebar header instead.
 */
export function isWindowsPlatform(): boolean {
  return /Windows/i.test(navigator.userAgent);
}
