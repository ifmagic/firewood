import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';

const { invokeMock, listenMock, callLog, listeners, terminals, resetHarness } = vi.hoisted(() => {
  const listeners = new Map<string, (event: unknown) => void>();
  const terminals: {
    write: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn> & ((cols: number, rows: number) => void);
    refresh: ReturnType<typeof vi.fn>;
  }[] = [];
  const callLog: string[] = [];
  let sessionCounter = 0;

  const invokeMock = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    callLog.push(`invoke:${cmd}:${(args?.id as string) ?? ''}`);
    switch (cmd) {
      case 'get_default_shell':
        return '/bin/zsh';
      case 'list_shells':
        return ['/bin/zsh', '/bin/bash'];
      case 'list_system_fonts':
        return ['Menlo'];
      case 'create_pty_session':
        sessionCounter += 1;
        return { id: `pty-${sessionCounter}` };
      default:
        return null;
    }
  });

  const listenMock = vi.fn(async (event: string, handler: (event: unknown) => void) => {
    callLog.push(`listen:${event}`);
    listeners.set(event, handler);
    return () => listeners.delete(event);
  });

  function resetHarness() {
    listeners.clear();
    callLog.length = 0;
    sessionCounter = 0;
    terminals.length = 0;
    invokeMock.mockClear();
    listenMock.mockClear();
  }

  return { invokeMock, listenMock, callLog, listeners, terminals, resetHarness };
});

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('@tauri-apps/api/event', () => ({ listen: listenMock }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('@xterm/xterm', () => ({
  // Mirrors @xterm/xterm 6.0.0 CoreBrowserTerminal.resize: same-size resize
  // is a no-op (no onResize fire); real changes fire handlers synchronously.
  Terminal: class {
    options: Record<string, unknown> = {};
    rows = 24;
    cols = 80;
    unicode = { activeVersion: '' };
    private resizeHandlers: Array<(event: { cols: number; rows: number }) => void> = [];
    onData = vi.fn(() => ({ dispose: vi.fn() }));
    onResize = vi.fn((callback: (event: { cols: number; rows: number }) => void) => {
      this.resizeHandlers.push(callback);
      return {
        dispose: () => {
          const index = this.resizeHandlers.indexOf(callback);
          if (index >= 0) this.resizeHandlers.splice(index, 1);
        },
      };
    });
    loadAddon = vi.fn();
    open = vi.fn();
    write = vi.fn();
    clear = vi.fn();
    resize = vi.fn((cols: number, rows: number) => {
      if (cols === this.cols && rows === this.rows) return;
      this.cols = cols;
      this.rows = rows;
      this.resizeHandlers.slice().forEach((handler) => handler({ cols, rows }));
    });
    refresh = vi.fn();
    dispose = vi.fn();
    focus = vi.fn();

    constructor() {
      terminals.push(this);
    }
  },
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn();
  },
}));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class {} }));

let TerminalPage: (typeof import('./index'))['default'];
let container: HTMLDivElement | null = null;
let root: Root | null = null;

const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
};

const buttonByText = (text: string) => {
  const btn = [...(container?.querySelectorAll('button') ?? [])].find((b) => b.textContent === text);
  expect(btn, `button "${text}"`).toBeTruthy();
  return btn!;
};

const clickAddTab = () => {
  const btn = container?.querySelector('.firewood-terminal-addTab');
  expect(btn, 'add tab button').toBeTruthy();
  click(btn!);
};

const tabButtons = () => [...(container?.querySelectorAll('.firewood-terminal-tabButton') ?? [])];
const tabCount = () => container?.querySelectorAll('.firewood-terminal-tab').length ?? 0;

function mountPage() {
  act(() => {
    root!.render(<TerminalPage />);
  });
}

async function flush(ms = 25) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

// forceTerminalRedraw restores on the second requestAnimationFrame after the
// trigger (the intermediate size must survive one real frame so WKWebView
// recomposites it). rAF callbacks run FIFO, so waiting for two further rAFs
// guarantees the restore callback has already run.
async function awaitRedrawRoundTrip() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

beforeAll(() => {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve(), load: vi.fn(async () => []) },
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

beforeEach(async () => {
  resetHarness();
  vi.resetModules();
  ({ default: TerminalPage } = await import('./index'));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('terminal lifecycle', () => {
  it('creates a first tab and reaches the ready state', async () => {
    mountPage();
    await flush();

    expect(tabCount()).toBe(1);
    expect(callLog).toContain('invoke:create_pty_session:');
    expect(callLog).toContain('invoke:start_pty_reader:pty-1');
    expect(container?.querySelector('[class*="overlay"]')).toBeNull();
  });

  it('registers PTY listeners before starting the reader', async () => {
    mountPage();
    await flush();

    const dataListenAt = callLog.indexOf('listen:pty:data:pty-1');
    const exitListenAt = callLog.indexOf('listen:pty:exit:pty-1');
    const readerAt = callLog.indexOf('invoke:start_pty_reader:pty-1');

    expect(dataListenAt).toBeGreaterThanOrEqual(0);
    expect(exitListenAt).toBeGreaterThanOrEqual(0);
    expect(readerAt).toBeGreaterThanOrEqual(0);
    expect(dataListenAt).toBeLessThan(readerAt);
    expect(exitListenAt).toBeLessThan(readerAt);
  });

  it('writes PTY output to the active terminal', async () => {
    mountPage();
    await flush();

    act(() => {
      listeners.get('pty:data:pty-1')!({ payload: { id: 'pty-1', data: 'hello pty' } });
    });

    expect(terminals[0].write).toHaveBeenCalledWith('hello pty');
  });

  it('refresh button round-trips terminal size across two frames and notifies the pty in order', async () => {
    mountPage();
    await flush();

    const refreshButton = container?.querySelector('.firewood-terminal-refresh');
    expect(refreshButton, 'refresh button').toBeTruthy();
    expect((refreshButton as HTMLButtonElement).disabled).toBe(false);
    click(refreshButton!);

    // First leg is synchronous: grow one column so this frame's layout
    // really changes (a same-frame round-trip is a net-zero layout change
    // and WKWebView would keep its stale composited output).
    expect(terminals[0].resize).toHaveBeenCalledTimes(1);
    expect(terminals[0].resize).toHaveBeenNthCalledWith(1, 81, 24);
    expect(invokeMock).toHaveBeenCalledWith('resize_pty', { id: 'pty-1', rows: 24, cols: 81 });

    await awaitRedrawRoundTrip();

    expect(terminals[0].resize).toHaveBeenCalledTimes(2);
    expect(terminals[0].resize).toHaveBeenNthCalledWith(2, 80, 24);
    expect(terminals[0].refresh).toHaveBeenCalledWith(0, 23);
    expect(invokeMock).toHaveBeenCalledWith('resize_pty', { id: 'pty-1', rows: 24, cols: 80 });
    // fit() on unchanged dimensions must not add a third notification
    expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'resize_pty')).toHaveLength(2);
  });

  it('round-trips the host through a 1px shrink and a fresh compositing layer', async () => {
    mountPage();
    await flush();

    const host = container?.querySelector('.firewood-terminal-container > div') as HTMLElement;
    expect(host, 'terminal host div').toBeTruthy();
    expect(host.style.width).toBe('100%');
    expect(host.style.height).toBe('100%');

    const refreshButton = container?.querySelector('.firewood-terminal-refresh');
    expect(refreshButton, 'refresh button').toBeTruthy();
    click(refreshButton!);

    // Intermediate frame: the host is 1px smaller on both axes and pinned to
    // its own compositing layer — the DOM-level equivalent of a window
    // resize, the only thing that reliably clears WKWebView's cached tiles
    // for the terminal subtree (incl. the .xterm-viewport async scroller,
    // which the cols round-trip never re-layouts).
    expect(host.style.width).toBe('calc(100% - 1px)');
    expect(host.style.height).toBe('calc(100% - 1px)');
    expect(host.style.transform).toBe('translateZ(0)');

    await awaitRedrawRoundTrip();

    // Restored to the exact inline values createTerminalHost set (clearing
    // with '' would drop the height and collapse the terminal).
    expect(host.style.width).toBe('100%');
    expect(host.style.height).toBe('100%');
    expect(host.style.transform).toBe('');
  });

  it('ignores refresh requests while a redraw round-trip is pending', async () => {
    mountPage();
    await flush();

    const refreshButton = container?.querySelector('.firewood-terminal-refresh');
    click(refreshButton!);
    // Rapid double click before the intermediate frame is painted: the
    // second request must not stack another round-trip.
    click(refreshButton!);
    expect(terminals[0].resize).toHaveBeenCalledTimes(1);

    await awaitRedrawRoundTrip();

    expect(terminals[0].resize).toHaveBeenCalledTimes(2);
    expect(terminals[0].resize).toHaveBeenNthCalledWith(1, 81, 24);
    expect(terminals[0].resize).toHaveBeenNthCalledWith(2, 80, 24);
    expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'resize_pty')).toHaveLength(2);
  });

  it('does not fight an external resize that took over the intermediate state', async () => {
    mountPage();
    await flush();

    const host = container?.querySelector('.firewood-terminal-container > div') as HTMLElement;
    const refreshButton = container?.querySelector('.firewood-terminal-refresh');
    click(refreshButton!);

    // Wait one frame (the intermediate 81-col state is now live), then let
    // an external fit() resize win — e.g. the user changed font size while
    // the round-trip was in flight. The restore leg must stand aside.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    terminals[0].resize(120, 30);

    await awaitRedrawRoundTrip();

    // Only the first leg (81, 24) ran; the restore to (80, 24) must stand
    // aside because the external resize now owns the terminal size.
    const resizeCalls = terminals[0].resize.mock.calls as Array<[number, number]>;
    expect(resizeCalls).toContainEqual([81, 24]);
    expect(resizeCalls).toContainEqual([120, 30]);
    expect(resizeCalls).not.toContainEqual([80, 24]);
    expect(invokeMock).not.toHaveBeenCalledWith('resize_pty', { id: 'pty-1', rows: 24, cols: 80 });

    // The transient host styles must still be dropped even though the
    // term-level restore stood aside — leaking them would permanently
    // shrink the terminal and pin a compositing layer.
    expect(host.style.width).toBe('100%');
    expect(host.style.height).toBe('100%');
    expect(host.style.transform).toBe('');
  });

  it('repaints mounted terminals when devicePixelRatio changes', async () => {
    mountPage();
    await flush();

    terminals[0].resize.mockClear();
    try {
      act(() => {
        Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
        window.dispatchEvent(new Event('resize'));
      });

      expect(terminals[0].resize).toHaveBeenNthCalledWith(1, 81, 24);
      await awaitRedrawRoundTrip();
      expect(terminals[0].resize).toHaveBeenNthCalledWith(2, 80, 24);
      expect(terminals[0].refresh).toHaveBeenCalledWith(0, 23);
      expect(invokeMock).toHaveBeenCalledWith('resize_pty', { id: 'pty-1', rows: 24, cols: 81 });
      expect(invokeMock).toHaveBeenCalledWith('resize_pty', { id: 'pty-1', rows: 24, cols: 80 });
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    }
  });

  it('repaints a tab on remount when devicePixelRatio changed while hidden', async () => {
    mountPage();
    await flush();

    clickAddTab();
    await flush();
    expect(tabCount()).toBe(2);

    act(() => {
      Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    });
    click(tabButtons()[0]);
    await flush();

    expect(terminals[0].resize).toHaveBeenNthCalledWith(1, 81, 24);
    await awaitRedrawRoundTrip();
    expect(terminals[0].resize).toHaveBeenNthCalledWith(2, 80, 24);
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
  });

  it('marks the tab exited and restarts on demand', async () => {
    mountPage();
    await flush();

    act(() => {
      listeners.get('pty:exit:pty-1')!({});
    });
    await flush();

    const banner = container?.querySelector('[class*="exited-banner"]');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain('Shell exited');
    expect(invokeMock).toHaveBeenCalledWith('close_pty_session', { id: 'pty-1' });

    click(buttonByText('Restart'));
    await flush();

    expect(callLog).toContain('invoke:create_pty_session:');
    expect(callLog).toContain('invoke:start_pty_reader:pty-2');
    expect(container?.querySelector('[class*="exited-banner"]')).toBeNull();
  });

  it('buffers background tab output and flushes it on activation', async () => {
    mountPage();
    await flush();

    clickAddTab();
    await flush();
    expect(tabCount()).toBe(2);

    click(tabButtons()[0]);
    await flush();

    const backgroundWrites = terminals[1].write.mock.calls.length;
    act(() => {
      listeners.get('pty:data:pty-2')!({ payload: { id: 'pty-2', data: 'background output' } });
    });
    expect(terminals[1].write.mock.calls.length).toBe(backgroundWrites);

    click(tabButtons()[1]);
    await flush();

    expect(terminals[1].write).toHaveBeenCalledWith('background output');
  });

  it('falls back to the remaining tab after closing the active one', async () => {
    mountPage();
    await flush();

    clickAddTab();
    await flush();
    expect(tabCount()).toBe(2);

    const closeButtons = container?.querySelectorAll('.firewood-terminal-tabClose') ?? [];
    click(closeButtons[0]);
    await flush();

    expect(tabCount()).toBe(1);
    expect(invokeMock).toHaveBeenCalledWith('close_pty_session', { id: 'pty-1' });
    expect(tabCount() === 1 && container?.querySelector('.firewood-terminal-tabButton')).toBeTruthy();
  });

  it('refuses to close a locked tab', async () => {
    mountPage();
    await flush();

    const lockButton = container?.querySelector('.firewood-terminal-tabLock');
    expect(lockButton).toBeTruthy();
    click(lockButton!);
    await flush();

    const closeButton = container?.querySelector('.firewood-terminal-tabClose');
    expect(closeButton).toBeTruthy();
    click(closeButton!);
    await flush();

    expect(tabCount()).toBe(1);
    expect(invokeMock).not.toHaveBeenCalledWith('close_pty_session', { id: 'pty-1' });
  });
});
