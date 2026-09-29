import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import TextDiff from './index';
import '../../i18n';

// React 19 requires this flag for act(); without it act still works but warns on every call.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// antd (rc-* components) depends on ResizeObserver, which jsdom does not implement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver !== 'function') {
  (globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverStub;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<TextDiff />);
  });
  // useCodemirror defers EditorView creation to a requestAnimationFrame callback; jsdom's
  // rAF cadence under vitest is unreliable, so poll for both panes with a deadline.
  const deadline = Date.now() + 3000;
  while (document.querySelectorAll('.fw-cm-host .cm-editor').length < 2 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

// The edit view renders exactly two .fw-tool-pane elements, original first, modified second.
function paneView(index: number): EditorView {
  const el = document.querySelectorAll('.fw-tool-pane')[index]?.querySelector('.cm-editor');
  if (!el) throw new Error(`pane ${index} editor not mounted`);
  const holder = el as HTMLElement & { cmView?: EditorView };
  return holder.cmView ?? EditorView.findFromDOM(holder)!;
}

// Each pane header hosts its actions in a fixed order:
// buttons[0] = Format JSON, buttons[1] = Unescape.
function paneButtons(index: number): HTMLButtonElement[] {
  const panes = document.querySelectorAll('.fw-tool-pane');
  if (panes.length <= index) throw new Error('edit pane not mounted');
  return Array.from(panes[index].querySelectorAll('button'));
}

function setPaneText(view: EditorView, text: string) {
  act(() => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  });
}

function click(button: HTMLButtonElement) {
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

describe('TextDiff pane JSON transforms', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
  });

  it('text-diff: mounts both edit panes as CodeMirror editors with a two-button header', async () => {
    await mount();
    expect(paneView(0)).toBeTruthy();
    expect(paneView(1)).toBeTruthy();
    expect(paneButtons(0).length).toBe(2);
    expect(paneButtons(1).length).toBe(2);
    // Empty panes disable both actions.
    expect(paneButtons(0).every((button) => button.disabled)).toBe(true);
    expect(paneButtons(1).every((button) => button.disabled)).toBe(true);
  });

  it('text-diff: Format JSON pretty-prints the pane content', async () => {
    await mount();
    const view = paneView(0);
    setPaneText(view, '{"a":1}');
    const [format] = paneButtons(0);
    expect(format.disabled).toBe(false);
    click(format);
    expect(view.state.doc.toString()).toBe('{\n  "a": 1\n}');
    // The transformed value is persisted for the next session.
    expect(localStorage.getItem('tool:text-diff:left')).toBe(JSON.stringify('{\n  "a": 1\n}'));
  });

  it('text-diff: Unescape unwraps escaped json in the pane', async () => {
    await mount();
    const view = paneView(1);
    setPaneText(view, '"{\\"a\\":1}"');
    const [, unescape] = paneButtons(1);
    click(unescape);
    expect(view.state.doc.toString()).toBe('{"a":1}');
  });

  it('text-diff: unparseable text is left untouched', async () => {
    await mount();
    const view = paneView(0);
    setPaneText(view, 'she said "hi"');
    const [, unescape] = paneButtons(0);
    click(unescape);
    expect(view.state.doc.toString()).toBe('she said "hi"');
  });

  it('text-diff: typing into one pane feeds the persisted value the diff is built from', async () => {
    await mount();
    setPaneText(paneView(0), '{"a":1}');
    setPaneText(paneView(1), '{"a":2}');
    expect(localStorage.getItem('tool:text-diff:left')).toBe(JSON.stringify('{"a":1}'));
    expect(localStorage.getItem('tool:text-diff:right')).toBe(JSON.stringify('{"a":2}'));
  });
});
