import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { setAlwaysOnTop, startDragging, toggleMaximize, minimize, close, isMaximized } = vi.hoisted(() => ({
  setAlwaysOnTop: vi.fn(async () => {}),
  startDragging: vi.fn(async () => {}),
  toggleMaximize: vi.fn(async () => {}),
  minimize: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  isMaximized: vi.fn(async () => false),
}));

// Captured by the onResized mock so tests can drive a resize event.
let resizeHandler: (() => void) | null = null;

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    setAlwaysOnTop,
    startDragging,
    toggleMaximize,
    minimize,
    close,
    isMaximized,
    onResized: async (handler: () => void) => {
      resizeHandler = handler;
      return () => {
        resizeHandler = null;
      };
    },
  }),
}));

let TitleBar: (typeof import('./index'))['default'];
let container: HTMLDivElement | null = null;
let root: Root | null = null;

const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/620.1.15 (KHTML, like Gecko)';
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)';

function stubUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

function renderBar() {
  act(() => {
    root!.render(<TitleBar />);
  });
}

const stripEl = () => container?.querySelector('[data-tauri-drag-region]') as HTMLElement;

const fireMouse = (target: Element | Window, type: string, init: MouseEventInit = {}) => {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init }));
};

/** A double-click as the browser produces it: down(1)/up, down(2)/up, dblclick. */
const fireDoubleClick = (el: Element, x = 400, y = 12) => {
  fireMouse(el, 'mousedown', { detail: 1, clientX: x, clientY: y });
  fireMouse(el, 'mouseup', { detail: 1, clientX: x, clientY: y });
  fireMouse(el, 'mousedown', { detail: 2, clientX: x, clientY: y });
  fireMouse(el, 'mouseup', { detail: 2, clientX: x, clientY: y });
  fireMouse(el, 'dblclick', { detail: 2, clientX: x, clientY: y });
};

const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
};

beforeEach(async () => {
  localStorage.clear();
  setAlwaysOnTop.mockClear();
  startDragging.mockClear();
  toggleMaximize.mockClear();
  minimize.mockClear();
  close.mockClear();
  isMaximized.mockClear();
  isMaximized.mockResolvedValue(false);
  resizeHandler = null;
  stubUserAgent(MAC_UA);
  vi.resetModules();
  ({ default: TitleBar } = await import('./index'));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  document.querySelectorAll('.ant-tooltip').forEach((el) => el.remove());
  container?.remove();
  container = null;
  root = null;
});

describe('TitleBar (macOS)', () => {
  it('renders a drag-region strip with the pin button on the right', () => {
    renderBar();

    const strip = stripEl();
    expect(strip, 'drag-region strip').toBeTruthy();
    // No custom title text: the native title (next to the traffic lights)
    // already identifies the app — Overlay does not hide it.
    expect(strip.textContent).toBe('');

    const pin = container?.querySelector('[aria-pressed]') as HTMLButtonElement | null;
    expect(pin, 'pin button').toBeTruthy();
    expect(pin!.getAttribute('aria-pressed')).toBe('false');
    expect(setAlwaysOnTop).toHaveBeenCalledWith(false);
    // macOS keeps the native traffic lights and renders only the pin.
    expect(container!.querySelectorAll('button')).toHaveLength(1);
  });

  it('applies a persisted pinned state on mount', () => {
    localStorage.setItem('firewood-always-on-top', 'true');
    renderBar();

    const pin = container?.querySelector('[aria-pressed]') as HTMLButtonElement | null;
    expect(pin!.getAttribute('aria-pressed')).toBe('true');
    expect(setAlwaysOnTop).toHaveBeenCalledWith(true);
  });

  it('renders nothing on Linux (native title bar stays)', () => {
    stubUserAgent(LINUX_UA);
    renderBar();

    expect(container?.querySelector('[data-tauri-drag-region]')).toBeNull();
    expect(container?.querySelector('[aria-pressed]')).toBeNull();
    expect(setAlwaysOnTop).not.toHaveBeenCalled();
  });

  it('keeps strip mousedowns away from document listeners (drag.js isolation)', () => {
    const documentMouseDown = vi.fn();
    document.addEventListener('mousedown', documentMouseDown);
    try {
      renderBar();
      fireMouse(stripEl(), 'mousedown', { detail: 1, clientX: 300, clientY: 10 });
      // Tauri's injected drag.js listens on document; if the event reached
      // it, its performDrag (raced against the first mouseup) could swallow
      // the second click of a double-click — the dead-zoom bug this
      // component takes over pointer handling to fix.
      expect(documentMouseDown).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('mousedown', documentMouseDown);
    }
  });

  it('starts dragging only after the pointer moves past the threshold', () => {
    renderBar();
    const strip = stripEl();

    fireMouse(strip, 'mousedown', { detail: 1, clientX: 100, clientY: 10 });
    // Jitter below the threshold (a click, or a double-click's tiny wiggle)
    // must not reach startDragging.
    fireMouse(window, 'mousemove', { buttons: 1, clientX: 102, clientY: 11 });
    expect(startDragging).not.toHaveBeenCalled();

    fireMouse(window, 'mousemove', { buttons: 1, clientX: 110, clientY: 10 });
    expect(startDragging).toHaveBeenCalledTimes(1);

    // Tracking is one-shot: later movement must not start a second drag.
    fireMouse(window, 'mousemove', { buttons: 1, clientX: 200, clientY: 10 });
    fireMouse(window, 'mouseup', { clientX: 200, clientY: 10 });
    expect(startDragging).toHaveBeenCalledTimes(1);
  });

  it('releases drag tracking on mouseup before any movement', () => {
    renderBar();
    const strip = stripEl();

    fireMouse(strip, 'mousedown', { detail: 1, clientX: 100, clientY: 10 });
    fireMouse(window, 'mouseup', { clientX: 100, clientY: 10 });
    // The tracking listeners are gone: even a large move does nothing.
    fireMouse(window, 'mousemove', { buttons: 1, clientX: 300, clientY: 10 });
    expect(startDragging).not.toHaveBeenCalled();
  });

  it('zooms the window on double-click of the strip', () => {
    renderBar();

    fireDoubleClick(stripEl());

    expect(toggleMaximize).toHaveBeenCalledTimes(1);
    // A double-click never goes through startDragging.
    expect(startDragging).not.toHaveBeenCalled();
  });

  it('keeps drag and zoom off the pin button', () => {
    renderBar();
    const pin = container?.querySelector('[aria-pressed]') as HTMLButtonElement;

    fireMouse(pin, 'mousedown', { detail: 1, clientX: 700, clientY: 10 });
    fireMouse(pin, 'mouseup', { detail: 1, clientX: 700, clientY: 10 });
    fireDoubleClick(pin, 700, 10);

    expect(startDragging).not.toHaveBeenCalled();
    expect(toggleMaximize).not.toHaveBeenCalled();
  });
});

describe('TitleBar (Windows custom chrome)', () => {
  const byLabel = (label: string) => container!.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement | null;

  beforeEach(() => {
    stubUserAgent(WINDOWS_UA);
  });

  it('puts the pin immediately before the caption buttons: pin, minimize, maximize, close', () => {
    renderBar();

    const strip = stripEl();
    expect(strip, 'drag-region strip').toBeTruthy();
    const labels = Array.from(container!.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual([
      i18n.t('titleBar.pin'),
      i18n.t('titleBar.minimize'),
      i18n.t('titleBar.maximize'),
      i18n.t('titleBar.close'),
    ]);
    // The pin toggles always-on-top; the strip itself carries no stray text.
    expect(strip.textContent).toBe('');
  });

  it('minimizes, restores and closes through the window controls', async () => {
    renderBar();
    await act(async () => {});

    click(byLabel(i18n.t('titleBar.minimize'))!);
    expect(minimize).toHaveBeenCalledTimes(1);

    click(byLabel(i18n.t('titleBar.maximize'))!);
    expect(toggleMaximize).toHaveBeenCalledTimes(1);

    click(byLabel(i18n.t('titleBar.close'))!);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('swaps the middle button to Restore when the window is maximized', async () => {
    renderBar();
    await act(async () => {});

    // Initial state comes from isMaximized() on mount.
    expect(byLabel(i18n.t('titleBar.maximize'))).toBeTruthy();

    isMaximized.mockResolvedValue(true);
    await act(async () => {
      resizeHandler?.();
    });

    expect(byLabel(i18n.t('titleBar.restore'))).toBeTruthy();
    expect(byLabel(i18n.t('titleBar.maximize'))).toBeNull();
  });

  it('keeps drag, zoom and minimize off the caption buttons', () => {
    renderBar();
    const minimizeButton = byLabel(i18n.t('titleBar.minimize'))!;

    fireMouse(minimizeButton, 'mousedown', { detail: 1, clientX: 700, clientY: 16 });
    fireMouse(minimizeButton, 'mouseup', { detail: 1, clientX: 700, clientY: 16 });
    fireDoubleClick(minimizeButton, 700, 16);

    expect(startDragging).not.toHaveBeenCalled();
    expect(toggleMaximize).not.toHaveBeenCalled();
  });

  it('still drags and zooms from the empty strip area', () => {
    renderBar();
    const strip = stripEl();

    fireMouse(strip, 'mousedown', { detail: 1, clientX: 200, clientY: 16 });
    fireMouse(window, 'mousemove', { buttons: 1, clientX: 210, clientY: 16 });
    expect(startDragging).toHaveBeenCalledTimes(1);

    fireMouse(window, 'mouseup', { clientX: 210, clientY: 16 });
    fireDoubleClick(strip, 200, 16);
    expect(toggleMaximize).toHaveBeenCalledTimes(1);
  });
});
