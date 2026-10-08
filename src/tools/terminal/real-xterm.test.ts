import { describe, expect, it } from 'vitest';
import { Terminal } from '@xterm/xterm';
import { attachClipboardKeyHandler } from './helpers';

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

// The clipboard chords on Windows/Linux, asserted against the REAL
// @xterm/xterm 6.0.0: the whole point of attachClipboardKeyHandler is xterm's
// consult-then-stand-down semantics, which a mock cannot reproduce.
//   - a handler that returns true leaves xterm's encoder in charge: Ctrl+C
//     becomes \x03 and the keydown is preventDefault-ed (SIGINT);
//   - a handler that returns false stops *before* the encoder and, crucially,
//     before the cancel(), so the event survives to the browser — which is
//     what fires the DOM copy/paste events xterm's own listeners handle.
// jsdom quirks: KeyboardEvent must be built with the legacy `keyCode`, because
// xterm's encoder reads `ev.keyCode`; and jsdom has no ClipboardEvent, so the
// copy half is asserted with a plain bubbling 'copy' event (xterm's listener
// only preventDefaults it when there is a selection).
function keydownOn(term: Terminal, init: KeyboardEventInit & { keyCode: number }) {
  const textarea = term.element!.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
  expect(textarea, 'xterm helper textarea').toBeTruthy();
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  textarea.dispatchEvent(event);
  return event;
}

function openTerminal(withClipboardHandler: boolean) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const term = new Terminal({ cols: 80, rows: 24 });
  if (withClipboardHandler) attachClipboardKeyHandler(term);
  term.open(host);

  const data: string[] = [];
  term.onData((chunk) => data.push(chunk));

  term.write('hello world');
  return { host, term, data };
}

describe('real xterm 6.0.0 clipboard chords', () => {
  it('without the handler, Ctrl+C is encoded as ^C and the event is swallowed', () => {
    const { host, term, data } = openTerminal(false);

    const event = keydownOn(term, { key: 'c', code: 'KeyC', ctrlKey: true, keyCode: 67 });

    expect(data).toEqual(['\x03']);
    expect(event.defaultPrevented).toBe(true);

    term.dispose();
    host.remove();
  });

  it('with the handler and no selection, Ctrl+C still reaches the shell as ^C', () => {
    const { host, term, data } = openTerminal(true);
    expect(term.hasSelection()).toBe(false);

    const event = keydownOn(term, { key: 'c', code: 'KeyC', ctrlKey: true, keyCode: 67 });

    expect(data).toEqual(['\x03']);
    expect(event.defaultPrevented).toBe(true);

    term.dispose();
    host.remove();
  });

  it('with the handler and a selection, Ctrl+C is handed to the browser copy path', () => {
    const { host, term, data } = openTerminal(true);
    term.select(0, 0, 5);
    expect(term.hasSelection()).toBe(true);

    const event = keydownOn(term, { key: 'c', code: 'KeyC', ctrlKey: true, keyCode: 67 });

    // Nothing goes to the pty and the keydown survives for the browser...
    expect(data).toEqual([]);
    expect(event.defaultPrevented).toBe(false);

    // ...whose copy event is what xterm itself turns into a clipboard write.
    const copyEvent = new Event('copy', { bubbles: true, cancelable: true });
    expect(term.element!.dispatchEvent(copyEvent)).toBe(false);
    expect(copyEvent.defaultPrevented).toBe(true);

    term.dispose();
    host.remove();
  });

  it('with the handler, Ctrl+V never reaches the pty as ^V', () => {
    const { host, term, data } = openTerminal(true);

    const event = keydownOn(term, { key: 'v', code: 'KeyV', ctrlKey: true, keyCode: 86 });

    expect(data).toEqual([]);
    expect(event.defaultPrevented).toBe(false);

    term.dispose();
    host.remove();
  });

  it('the copy event is only claimed by xterm when a selection exists', () => {
    const { host, term } = openTerminal(true);
    expect(term.hasSelection()).toBe(false);

    const copyEvent = new Event('copy', { bubbles: true, cancelable: true });
    expect(term.element!.dispatchEvent(copyEvent)).toBe(true);
    expect(copyEvent.defaultPrevented).toBe(false);

    term.dispose();
    host.remove();
  });
});
