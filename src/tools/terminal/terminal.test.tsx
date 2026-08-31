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
  Terminal: class {
    options: Record<string, unknown> = {};
    rows = 24;
    cols = 80;
    unicode = { activeVersion: '' };
    onData = vi.fn(() => ({ dispose: vi.fn() }));
    onResize = vi.fn(() => ({ dispose: vi.fn() }));
    loadAddon = vi.fn();
    open = vi.fn();
    write = vi.fn();
    clear = vi.fn();
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
