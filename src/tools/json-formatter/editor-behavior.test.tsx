import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import JsonFormatter from './index';
import '../../i18n';

// React 19 requires this flag for act(); without it act still works but warns on every call.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.requestAnimationFrame !== 'function') {
  (globalThis as Record<string, unknown>).requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 16)) as typeof requestAnimationFrame;
  (globalThis as Record<string, unknown>).cancelAnimationFrame = ((id: number) =>
    clearTimeout(id)) as typeof cancelAnimationFrame;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<JsonFormatter />);
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

function getViewFromDom(el: Element | null | undefined): EditorView | null {
  if (!el) return null;
  const holder = el as HTMLElement & { cmView?: EditorView };
  return holder.cmView ?? EditorView.findFromDOM(el as HTMLElement) ?? null;
}

function getToolView(): EditorView | null {
  return getViewFromDom(document.querySelector('.fw-cm-host .cm-editor'));
}

function mainSelection(view: EditorView) {
  const main = view.state.selection.main;
  return { anchor: main.anchor, head: main.head };
}

function pressShiftArrowLeft(view: EditorView) {
  // CM6 keymaps listen on contentDOM, not the outer editor element.
  const event = new KeyboardEvent('keydown', {
    key: 'ArrowLeft',
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    view.contentDOM.dispatchEvent(event);
  });
}

describe('JsonFormatter editor (CodeMirror regression tests)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
  });

  it('control: bare CM6 keymap handles Shift+ArrowLeft in jsdom', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const view = new EditorView({
      state: EditorState.create({
        doc: 'hello world',
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          highlightSelectionMatches(),
        ],
      }),
      parent: host,
    });
    view.dispatch({ selection: { anchor: 11, head: 11 } });
    pressShiftArrowLeft(view);
    const sel = mainSelection(view);
    view.destroy();
    host.remove();
    expect(sel).toEqual({ anchor: 11, head: 10 });
  });

  it('json-formatter: mounts the CodeMirror view', async () => {
    await mount();
    expect(getToolView()).toBeTruthy();
  });

  it('json-formatter: Shift+ArrowLeft extends selection', async () => {
    await mount();
    const view = getToolView()!;
    act(() => {
      view.dispatch({ changes: { from: 0, to: 0, insert: 'hello world' } });
    });
    await flush(80);
    act(() => {
      view.dispatch({ selection: { anchor: 11, head: 11 } });
    });
    await flush(40);
    pressShiftArrowLeft(view);
    const sel = mainSelection(view);
    expect(sel).toEqual({ anchor: 11, head: 10 });
  });

  it('json-formatter: selection at doc start does not jump after delays', async () => {
    await mount();
    const view = getToolView()!;
    act(() => {
      view.dispatch({ changes: { from: 0, to: 0, insert: '{"a":1}\nsecond line' } });
    });
    await flush(80);
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 0 } });
    });
    // Wait past the linter delay (750ms) and any debounced effect.
    await flush(1200);
    const sel = mainSelection(view);
    expect(sel).toEqual({ anchor: 0, head: 0 });
  });

  it('json-formatter: editor DOM stays connected across re-renders', async () => {
    await mount();
    const view = getToolView()!;
    const editorNode = view.dom;
    act(() => {
      view.dispatch({ changes: { from: 0, to: 0, insert: 'abc def' } });
    });
    await flush(80);
    expect(editorNode.isConnected).toBe(true);
    expect(getToolView()).toBe(view);
    // selection-only change triggers hasSelection state update → re-render
    act(() => {
      view.dispatch({ selection: { anchor: 4, head: 4 } });
    });
    await flush(40);
    expect(editorNode.isConnected).toBe(true);
  });

  it('json-formatter: doc and controlled content stay in sync after edits', async () => {
    await mount();
    const view = getToolView()!;
    act(() => {
      view.dispatch({ changes: { from: 0, to: 0, insert: 'first' } });
    });
    await flush(80);
    act(() => {
      view.dispatch({ changes: { from: 5, to: 5, insert: '-second' } });
    });
    await flush(80);
    expect(view.state.doc.toString()).toBe('first-second');
    const stored = localStorage.getItem('tool:json-formatter:input');
    expect(stored).toBe(JSON.stringify('first-second'));
  });
});
