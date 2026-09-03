/**
 * WKWebView focus({preventScroll: true}) shim (Tauri macOS).
 *
 * The Safari 26 WebKit engine ignores `preventScroll` on `focus()` and scrolls the
 * focused editable's caret into view anyway. CodeMirror 6.43 knows about this and
 * hard-disables its preventScroll feature detection for `safari_version >= 26`, but
 * that UA check can never match inside WKWebView: Tauri's user agent carries no
 * `Version/<n>` token at all, so CM parses safari_version as 0, takes the broken
 * feature-detect path, and from the first focus() on believes preventScroll is
 * supported. Every later CM focus — mousedown on an unfocused editor,
 * EditorView.focus() — then lets WebKit scroll the *old* caret/selection into view.
 * User-visible symptom (json-formatter, 1000+ line doc): cursor sits around line
 * 100, scroll down to line 1000, click → viewport jumps back to the line ~100 area.
 *
 * Fix: inside Tauri's WKWebView, wrap HTMLElement.prototype.focus so any call with
 * preventScroll:true gets real scroll preservation — save the scroll offsets of all
 * ancestors, run the native focus, then restore them. This mirrors the exact
 * fallback CodeMirror itself uses for engines without preventScroll support
 * (getScrollStack/restoreScrollStack in @codemirror/view).
 */

export interface WKWebViewFocusShim {
  installed: boolean;
  /** Dev diagnostics: number of focus calls whose engine scroll was reverted. */
  rescuedCount: () => number;
  /** Dev diagnostics: last rescue record, if any. */
  lastRescue: () => { target: string; restoredTop: number } | null;
}

let rescued = 0;
let lastRescue: { target: string; restoredTop: number } | null = null;
let shimActive = false;

/** Whether the focus shim is currently wrapping HTMLElement.prototype.focus. */
export function isShimActive(): boolean {
  return shimActive;
}

/**
 * True when running inside a Tauri WKWebView on an Apple-Web engine that is not
 * Safari proper (Safari's UA contains `Version/…`, WKWebView's does not — that is
 * exactly the detection hole that disables CodeMirror's own workaround).
 */
export function isTauriWKWebView(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (!('__TAURI_INTERNALS__' in window)) return false;
  const ua = navigator.userAgent;
  return /AppleWebKit\//.test(ua) && !/Version\/\d+/.test(ua);
}

/**
 * Install the scroll-preserving focus wrapper unconditionally (idempotent).
 * Split out from installWKWebViewFocusShim so tests can exercise the mechanism
 * in engines that honor preventScroll.
 */
export function installFocusScrollPreservation(): WKWebViewFocusShim {
  const result: WKWebViewFocusShim = {
    installed: false,
    rescuedCount: () => rescued,
    lastRescue: () => lastRescue,
  };

  const proto = HTMLElement.prototype as HTMLElement & {
    focus: (this: HTMLElement, options?: FocusOptions) => void;
    __fwPreventScrollShim?: boolean;
  };
  const originalFocus = proto.focus;
  if (proto.__fwPreventScrollShim || !originalFocus) return result;

  const shimmedFocus = function focus(this: HTMLElement, options?: FocusOptions): void {
    // Only calls that explicitly ask for preventScroll are wrapped. Reading
    // `.preventScroll` is safe even for CM's getter-based feature probe (the
    // getter simply runs, as it would without the shim).
    if (!options || options.preventScroll !== true) {
      originalFocus.call(this);
      return;
    }
    const stack: Array<{ el: Element; left: number; top: number }> = [];
    stack.push({ el: this, left: this.scrollLeft, top: this.scrollTop });
    for (let cur: Node | null = this.parentNode; cur; ) {
      if (cur.nodeType === 11) {
        cur = (cur as ShadowRoot).host;
        continue;
      }
      if (cur.nodeType === 1) {
        const el = cur as Element;
        stack.push({ el, left: el.scrollLeft, top: el.scrollTop });
      }
      cur = cur.parentNode;
    }
    originalFocus.call(this, options);
    // WebKit (Safari 26 engine) ignored preventScroll above and may have scrolled
    // some ancestor to reveal the old caret; undo it in the same task so no paint
    // happens in between.
    for (const { el, left, top } of stack) {
      if (el.scrollTop !== top) {
        el.scrollTop = top;
        rescued++;
        lastRescue = {
          target: this.tagName.toLowerCase() + (this.className ? '.' + String(this.className).split(' ')[0] : ''),
          restoredTop: top,
        };
      }
      if (el.scrollLeft !== left) el.scrollLeft = left;
    }
  };
  proto.focus = shimmedFocus;
  proto.__fwPreventScrollShim = true;
  shimActive = true;
  result.installed = true;
  return result;
}

export function installWKWebViewFocusShim(): WKWebViewFocusShim {
  if (!isTauriWKWebView()) {
    return {
      installed: false,
      rescuedCount: () => rescued,
      lastRescue: () => lastRescue,
    };
  }
  return installFocusScrollPreservation();
}
