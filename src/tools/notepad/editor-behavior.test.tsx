import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
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
});
