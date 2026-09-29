import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { ensureSyntaxTree, foldCode, foldState, foldable, foldedRanges } from '@codemirror/language';
import Notepad from './index';
import '../../i18n';

// React 19 requires this flag for act(); without it act still works but warns on every call.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// antd Tabs (rc-tabs) depends on ResizeObserver, which jsdom does not implement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver !== 'function') {
  (globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverStub;
}

// jsdom's Range lacks getClientRects/getBoundingClientRect; CodeMirror's vertical cursor
// movement (addCursorAbove/Below behind Mod-Alt+arrows) needs it. Give text ranges a
// plausible 7x14 rect so the command runs instead of throwing.
if (typeof Range.prototype.getClientRects !== 'function') {
  Range.prototype.getClientRects = function () {
    return [new DOMRect(0, 0, 7, 14)] as unknown as DOMRectList;
  };
}

const JSON_COMPACT = '{"a": [1, 2], "b": {"c": 3}}';
const JSON_FORMATTED = '{\n  "a": [1, 2],\n  "b": {"c": 3}\n}';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Notepad />);
  });
  // The hook defers EditorView creation to a requestAnimationFrame callback; jsdom's rAF
  // cadence under vitest is unreliable, so poll for the mounted editor with a deadline.
  const deadline = Date.now() + 3000;
  while (!document.querySelector('.fw-cm-host .cm-editor') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function flush(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function getToolView(): EditorView | null {
  const el = document.querySelector('.fw-cm-host .cm-editor');
  if (!el) return null;
  const holder = el as HTMLElement & { cmView?: EditorView };
  return holder.cmView ?? EditorView.findFromDOM(el as HTMLElement) ?? null;
}

function statusLanguageChip(): string | null {
  return document.querySelector('.firewood-notepad-statusLanguage')?.textContent ?? null;
}

async function insertAndSettle(view: EditorView, text: string) {
  act(() => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  });
  // Give the Lezer parse worker time to finish the JSON tree.
  await flush(150);
}

describe('Notepad editor (JSON highlighting / folding regression tests)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
  });

  it('notepad: mounts the CodeMirror view with the default tab', async () => {
    await mount();
    expect(getToolView()).toBeTruthy();
    // Empty tab: no language chip.
    expect(statusLanguageChip()).toBeNull();
  });

  it('notepad: inserting JSON switches the language (status chip shows JSON)', async () => {
    await mount();
    const view = getToolView()!;
    await insertAndSettle(view, JSON_COMPACT);
    expect(statusLanguageChip()).toBe('JSON');
  });

  it('notepad: formatted JSON gains foldable ranges once the language is active', async () => {
    await mount();
    const view = getToolView()!;
    await insertAndSettle(view, JSON_FORMATTED);
    expect(statusLanguageChip()).toBe('JSON');
    expect(ensureSyntaxTree(view.state, view.state.doc.length, 5000)).toBeTruthy();
    // Foldability is queried per line; the outer object folds from the first line.
    const line = view.state.doc.line(1);
    const range = foldable(view.state, line.from, line.to);
    expect(range).not.toBeNull();
    expect(range!.from).toBe(1);
    expect(range!.to).toBe(view.state.doc.length - 1);
  });

  it('notepad: plain text stays plaintext and unfoldable', async () => {
    await mount();
    const view = getToolView()!;
    await insertAndSettle(view, 'first line\nsecond line');
    expect(statusLanguageChip()).toBeNull();
    const line = view.state.doc.line(1);
    expect(foldable(view.state, line.from, line.to)).toBeNull();
  });

  it('notepad: folding machinery is installed and folds the JSON object', async () => {
    await mount();
    const view = getToolView()!;
    await insertAndSettle(view, JSON_FORMATTED);
    // codeFolding/foldState is registered by the code variant (via foldGutter) and the
    // fold gutter element is in the DOM.
    expect(view.state.field(foldState, false)).toBeTruthy();
    expect(view.dom.querySelector('.cm-foldGutter')).toBeTruthy();
    act(() => {
      view.dispatch({ selection: { anchor: 1, head: 1 } });
    });
    // foldCode is what foldKeymap binds (Cmd-Alt-[ on macOS; the Ctrl-Shift-[ variant is
    // unavoidably shadowed by defaultKeymap's Mod-[ indentLess because CM's keymap lookup
    // tries the shift-dropped key name first — same in upstream basicSetup), so invoke it
    // directly instead of synthesizing a keydown.
    let folded = false;
    act(() => {
      folded = foldCode(view);
    });
    expect(folded).toBe(true);
    // jsdom's zero-height viewport never renders the fold placeholder widget, so assert
    // the fold state instead of the DOM.
    expect(foldedRanges(view.state).size).toBeGreaterThan(0);
  });

  // Column (vertical) selection: Alt+drag rectangles plus the stock multi-cursor bindings
  // (Cmd/Ctrl+click, Mod-Alt+arrows). drawSelection() is banned in the code variant
  // (WKWebView), so secondary ranges are rendered by the hook's mark/widget decorations
  // instead of CM's selection layers.
  describe('column selection', () => {
    function pressArrowDown(view: EditorView, modifiers: KeyboardEventInit) {
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
        ...modifiers,
      });
      act(() => {
        view.contentDOM.dispatchEvent(event);
      });
    }

    // Mod is Cmd on macOS and Ctrl elsewhere; CodeMirror reads it from navigator.platform,
    // which jsdom leaves empty (= not macOS), so Ctrl is the right modifier in tests.
    const MOD_ALT = { ctrlKey: true, altKey: true };

    it('notepad: Mod-Alt+ArrowDown adds a secondary cursor without touching the document', async () => {
      await mount();
      const view = getToolView()!;
      const text = 'line one\nline two\nline three';
      await insertAndSettle(view, text);
      act(() => {
        view.dispatch({ selection: { anchor: 4, head: 4 } });
      });
      pressArrowDown(view, MOD_ALT);
      // jsdom has no layout, so the added cursor lands at a fallback position — only the
      // range count and the no-side-effect assertions matter here.
      expect(view.state.selection.ranges.length).toBe(2);
      expect(view.state.doc.toString()).toBe(text);
    });

    it('notepad: Shift-Alt+ArrowDown keeps the defaultKeymap copy-line binding', async () => {
      await mount();
      const view = getToolView()!;
      const text = 'line one\nline two\nline three';
      await insertAndSettle(view, text);
      act(() => {
        view.dispatch({ selection: { anchor: 4, head: 4 } });
      });
      pressArrowDown(view, { shiftKey: true, altKey: true });
      // Add-cursor-above/below is bound to Mod-Alt only: re-binding Shift-Alt (the standard
      // copyLineUp/copyLineDown shortcut) would silently break line duplication.
      expect(view.state.doc.toString()).toBe('line one\nline one\nline two\nline three');
      expect(view.state.selection.ranges.length).toBe(1);
    });

    it('notepad: secondary cursors of a multi-selection render as widget carets', async () => {
      await mount();
      const view = getToolView()!;
      await insertAndSettle(view, 'line one\nline two');
      act(() => {
        view.dispatch({
          selection: EditorSelection.create([EditorSelection.cursor(2), EditorSelection.cursor(12)]),
        });
      });
      const carets = view.dom.querySelectorAll('.cm-secondaryCursor');
      // Exactly one widget per secondary cursor; the main cursor is the native caret.
      expect(carets.length).toBe(1);
    });

    it('notepad: non-main ranges of a rectangular selection render as marks', async () => {
      await mount();
      const view = getToolView()!;
      await insertAndSettle(view, 'hello world\nsecond line');
      act(() => {
        view.dispatch({
          selection: EditorSelection.create([EditorSelection.range(0, 5), EditorSelection.range(12, 18)]),
        });
      });
      const marks = view.dom.querySelectorAll('.cm-multiselection');
      // The main range is rendered by the native selection; only the secondary range
      // ('second') is drawn as a mark.
      expect(marks.length).toBe(1);
      expect(marks[0].textContent).toBe('second');
    });

    it('notepad: single-range selections render no secondary artifacts', async () => {
      await mount();
      const view = getToolView()!;
      await insertAndSettle(view, 'hello world\nsecond line');
      act(() => {
        view.dispatch({ selection: { anchor: 0, head: 5 } });
      });
      expect(view.dom.querySelectorAll('.cm-multiselection').length).toBe(0);
      expect(view.dom.querySelectorAll('.cm-secondaryCursor').length).toBe(0);
    });

    it('notepad: Cmd/Ctrl+click is reserved for links instead of adding a cursor', async () => {
      await mount();
      const view = getToolView()!;
      // Notepad opens links on Cmd/Ctrl+click — the same modifier CM6 uses for
      // click-adds-selection-range — so it opts out of that gesture; multi-cursor stays on
      // Mod-Alt+arrows / Alt+drag. Losing this extension would silently make the two fight.
      const [addsSelectionRange] = view.state.facet(EditorView.clickAddsSelectionRange);
      expect(addsSelectionRange).toBeTruthy();
      expect(addsSelectionRange(new MouseEvent('mousedown', { ctrlKey: true }))).toBe(false);
      expect(addsSelectionRange(new MouseEvent('mousedown', { metaKey: true }))).toBe(false);
    });
  });
});
