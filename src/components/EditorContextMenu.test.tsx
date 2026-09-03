import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import type { RefObject } from 'react';
import EditorContextMenu from './EditorContextMenu';
import '../i18n';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// antd portal positioning depends on ResizeObserver, which jsdom does not implement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver !== 'function') {
  (globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverStub;
}

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16)) as (
    cb: FrameRequestCallback,
  ) => number;
  globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as (id: number) => void;
}

async function flush(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function findMenuItem(label: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('.ant-dropdown-menu-item')].find((el) =>
    el.textContent?.includes(label),
  );
}

describe('EditorContextMenu', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  let view: EditorView | null = null;
  let focusStealer: HTMLInputElement | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    // The editor host must live OUTSIDE the React container: createRoot clears the
    // container's existing children on first render, which would detach the editor
    // DOM from the document (making .focus() a no-op in jsdom).
    host = document.createElement('div');
    document.body.appendChild(host);
    view = new EditorView({
      state: EditorState.create({ doc: 'hello world' }),
      parent: host,
    });
    focusStealer = document.createElement('input');
    document.body.appendChild(focusStealer);
  });

  afterEach(() => {
    act(() => root?.unmount());
    view?.destroy();
    container?.remove();
    focusStealer?.remove();
    container = null;
    root = null;
    host = null;
    view = null;
    focusStealer = null;
  });

  it('selectAll restores editor focus and selects the whole document', async () => {
    const viewRef: RefObject<EditorView | null> = { current: view };
    root = createRoot(container!);
    await act(async () => {
      root!.render(
        <EditorContextMenu viewRef={viewRef} hasSelection={false}>
          <div data-testid="trigger">editor area</div>
        </EditorContextMenu>,
      );
    });

    // Simulate the real-world state after clicking a menu item: focus is outside the editor.
    act(() => {
      focusStealer!.focus();
    });
    expect(document.activeElement).toBe(focusStealer);

    await act(async () => {
      container!
        .querySelector('[data-testid="trigger"]')!
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    await flush(30);

    const item = findMenuItem('Select All');
    expect(item, 'menu item "Select All" rendered').toBeTruthy();
    await act(async () => {
      item!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await flush(30);

    expect(document.activeElement).toBe(view!.contentDOM);
    const main = view!.state.selection.main;
    expect({ anchor: main.anchor, head: main.head }).toEqual({ anchor: 0, head: 11 });
  });
});
