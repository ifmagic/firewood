/**
 * DEV-ONLY diagnostics for the json-formatter "click after scroll jumps back" bug.
 * Shared log buffer + CM extension. Never used in production builds
 * (`import.meta.env.DEV` gates the call site in index.tsx).
 */
import { EditorView, ViewPlugin, type Extension, type ViewUpdate } from '@codemirror/view';
import { Transaction } from '@codemirror/state';
import { isTauriWKWebView, isShimActive } from '../../utils/wkWebViewFocusShim';

export interface LogEntry {
  t: string;
  tag: string;
  msg: string;
}

const MAX_ENTRIES = 80;
export const buffer: LogEntry[] = [];
export const listeners = new Set<() => void>();

export function log(tag: string, msg: string) {
  const t = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  buffer.push({
    t: `${pad(t.getMinutes())}:${pad(t.getSeconds())}.${String(t.getMilliseconds()).padStart(3, '0')}`,
    tag,
    msg,
  });
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
  for (const l of listeners) l();
}

function lineAt(view: EditorView, pos: number) {
  return view.state.doc.lineAt(pos).number;
}

function shortStack() {
  try {
    throw new Error();
  } catch (e) {
    return ((e as Error).stack || '')
      .split('\n')
      .slice(2, 5)
      .map((l) => l.replace(/^.*at /, '').trim())
      .filter((l) => l && !l.includes('jumpDebugger'))
      .join(' <- ');
  }
}

let probeDone = false;

function runProbe(view: EditorView) {
  if (probeDone) return;
  probeDone = true;
  const scroller = view.scrollDOM;
  log('probe', `engine: ${navigator.userAgent}`);
  log('probe', `vendor: ${navigator.vendor} | platform: ${navigator.platform}`);
  log(
    'probe',
    `CM SafariVersion regex: ${/Version\/(\d+(\.\d+)?)/.exec(navigator.userAgent)?.[1] ?? 'NO MATCH → CM safari_version=0 → Safari-26 preventScroll workaround DISABLED in this webview'}`,
  );
  log('probe', `isTauriWKWebView=${isTauriWKWebView()} shimActive=${isShimActive()}`);
  log(
    'probe',
    `baseline: document.hasFocus=${document.hasFocus()} activeElement=${document.activeElement?.tagName ?? 'none'}`,
  );

  // Live preventScroll probe: caret near doc start, scroll far away, focus.
  const selBackup = view.state.selection.main.head;
  const scrollBackup = scroller.scrollTop;
  try {
    view.dispatch({ selection: { anchor: 1, head: 1 } });
  } catch {
    return;
  }
  const far = Math.max(0, scroller.scrollHeight - scroller.clientHeight * 1.5);
  scroller.scrollTop = far;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!probeViewAlive(view)) return;
      const before = scroller.scrollTop;
      try {
        view.contentDOM.focus({ preventScroll: true });
      } catch {
        return;
      }
      const syncAfter = scroller.scrollTop;
      requestAnimationFrame(() => {
        if (!probeViewAlive(view)) return;
        const asyncAfter = scroller.scrollTop;
        log(
          'probe',
          `focus(preventScroll) ΔscrollTop sync=${(syncAfter - before).toFixed(0)}px async=${(asyncAfter - before).toFixed(0)}px ` +
            (Math.abs(asyncAfter - before) > 1
              ? '→ ENGINE SCROLLED, shim failed to revert'
              : `→ no scroll (prevented${isShimActive() ? ' by shim' : ''})`),
        );
        scroller.scrollTop = scrollBackup;
        try {
          view.dispatch({ selection: { anchor: selBackup, head: selBackup } });
        } catch {
          return;
        }
        log('probe', 'probe finished, state restored');
      });
    });
  });
}

export function jumpDebuggerExtension(): Extension {
  return [
    EditorView.domEventObservers({
      mousedown: (_event, view) => {
        const sel = view.state.selection.main;
        log(
          'mousedown',
          `pre-handler: hasFocus=${view.hasFocus} docFocus=${document.hasFocus()} activeEl=${document.activeElement?.tagName ?? 'none'}` +
            ` caret=L${lineAt(view, sel.head)} scrollTop=${Math.round(view.scrollDOM.scrollTop)}`,
        );
      },
    }),
    ViewPlugin.fromClass(
      class {
        private probeTimer: ReturnType<typeof setTimeout> | null = null;

        constructor(view: EditorView) {
          view.contentDOM.addEventListener('focus', () =>
            log(
              'focus',
              `contentDOM focused (activeEl=${document.activeElement?.tagName}) scrollTop=${Math.round(view.scrollDOM.scrollTop)}`,
            ),
          );
          view.contentDOM.addEventListener('blur', () =>
            log('blur', `contentDOM blurred (next activeEl=${document.activeElement?.tagName})`),
          );
          view.scrollDOM.addEventListener('scroll', () => {
            log('scroll', `scrollTop=${Math.round(view.scrollDOM.scrollTop)} via ${shortStack() || 'engine/native'}`);
          });
          this.probeTimer = setTimeout(() => {
            this.probeTimer = null;
            try {
              runProbe(view);
            } catch {
              /* view may already be torn down (e.g. vitest) */
            }
          }, 1200);
        }

        update(update: ViewUpdate) {
          for (const tr of update.transactions) {
            const userEvent = tr.annotation(Transaction.userEvent);
            if (tr.scrollIntoView) {
              const head = tr.selection?.main.head ?? update.state.selection.main.head;
              log('trx', `scrollIntoView→L${lineAt(update.view, head)}${userEvent ? ` (${userEvent})` : ''}`);
            } else if (update.selectionSet && userEvent) {
              const head = update.state.selection.main.head;
              log('trx', `selection→L${lineAt(update.view, head)} (${userEvent})`);
            }
          }
        }

        destroy() {
          if (this.probeTimer) clearTimeout(this.probeTimer);
        }
      },
    ),
  ];
}

// guard for probe callbacks after teardown
const probeViewAlive = (view: EditorView) => {
  try {
    view.state.doc.toString();
    return true;
  } catch {
    return false;
  }
};
