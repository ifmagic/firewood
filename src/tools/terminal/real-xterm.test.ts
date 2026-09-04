import { describe, expect, it } from 'vitest';
import { Terminal } from '@xterm/xterm';

// jsdom lacks matchMedia, which xterm's CoreBrowserService requires on open.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Regression guard against the REAL @xterm/xterm 6.0.0 (installed in
// node_modules, not the TerminalPage mock). These are the intrinsic xterm
// behaviors that forceTerminalRedraw's cross-frame round-trip relies on:
//   - a real size change fires onResize synchronously (→ resize_pty/SIGWINCH)
//   - DomRenderer.renderRows does replaceChildren per resize, so every resize
//     rebuilds the viewport row DOM from the buffer
//   - same-size resize is a no-op (no onResize, no rebuild) — which is exactly
//     why re-issuing the current size can never repaint anything by itself.
// Note: this file intentionally does NOT reproduce the cross-frame split;
// WKWebView compositing cannot be observed in jsdom. It pins only the xterm
// side of the contract.
const flushWrites = (term: Terminal) =>
  new Promise<void>((resolve) => {
    term.write('', () => resolve());
  });

describe('real xterm 6.0.0 resize round-trip', () => {
  it('rebuilds viewport row DOM synchronously on each resize and fires onResize', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const term = new Terminal({ cols: 80, rows: 24 });
    term.open(host);

    term.write('hello world');
    await flushWrites(term);
    await new Promise((r) => setTimeout(r, 50));

    const rowsEl = host.querySelector('.xterm-rows') as HTMLElement;
    expect(rowsEl, 'xterm-rows container').toBeTruthy();

    const rowBefore = rowsEl.children[0] as HTMLElement;
    const spanBefore = rowBefore.firstElementChild;

    const resizeEvents: Array<{ cols: number; rows: number }> = [];
    term.onResize((e) => resizeEvents.push({ cols: e.cols, rows: e.rows }));

    term.resize(81, 24);

    const rowAfterGrow = rowsEl.children[0] as HTMLElement;
    const spanAfterGrow = rowAfterGrow.firstElementChild;

    term.resize(80, 24);

    const rowAfterRestore = rowsEl.children[0] as HTMLElement;
    const spanAfterRestore = rowAfterRestore.firstElementChild;

    expect(resizeEvents.map((e) => e.cols)).toEqual([81, 80]);
    // DOM renderer renderRows does replaceChildren => fresh span nodes each resize
    expect(spanBefore && spanAfterGrow && spanBefore !== spanAfterGrow).toBe(true);
    expect(spanAfterRestore && spanAfterRestore !== spanAfterGrow).toBe(true);
    expect(rowAfterRestore.textContent).toContain('hello world');

    term.dispose();
    host.remove();
  });

  it('same-size resize is a no-op (no onResize, no DOM rebuild)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const term = new Terminal({ cols: 80, rows: 24 });
    term.open(host);

    term.write('abc');
    await flushWrites(term);

    const rowsEl = host.querySelector('.xterm-rows') as HTMLElement;
    const spanBefore = (rowsEl.children[0] as HTMLElement).firstElementChild;

    let fired = 0;
    term.onResize(() => fired++);

    term.resize(80, 24); // same size → early return in CoreBrowserTerminal
    expect(fired).toBe(0);
    expect((rowsEl.children[0] as HTMLElement).firstElementChild === spanBefore).toBe(true);

    term.dispose();
    host.remove();
  });
});
