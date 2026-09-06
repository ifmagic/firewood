import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';

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

const { setAlwaysOnTop, getCurrentWindowImpl } = vi.hoisted(() => ({
  setAlwaysOnTop: vi.fn(async () => {}),
  getCurrentWindowImpl: vi.fn(() => ({ setAlwaysOnTop })),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => getCurrentWindowImpl(),
}));

let PinToggle: (typeof import('./index'))['default'];
let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderToggle(placement: 'left' | 'right' = 'left') {
  act(() => {
    root!.render(<PinToggle variant="sidebar" placement={placement} />);
  });
}

const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
};

async function flush(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function pinButton(): HTMLButtonElement {
  return container!.querySelector('[aria-pressed]') as HTMLButtonElement;
}

beforeEach(async () => {
  localStorage.clear();
  setAlwaysOnTop.mockClear();
  getCurrentWindowImpl.mockClear();
  getCurrentWindowImpl.mockImplementation(() => ({ setAlwaysOnTop }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  PinToggle = (await import('./index')).default;
});

afterEach(() => {
  act(() => root?.unmount());
  document.querySelectorAll('.ant-tooltip').forEach((el) => el.remove());
  container?.remove();
  container = null;
  root = null;
});

describe('PinToggle', () => {
  it('renders unpinned with a dynamic label and applies the state on mount', () => {
    renderToggle();

    const pin = pinButton();
    expect(pin.getAttribute('aria-pressed')).toBe('false');
    expect(pin.getAttribute('aria-label')).toBe('Pin');
    expect(setAlwaysOnTop).toHaveBeenCalledWith(false);
  });

  it('applies a persisted pinned state on mount', () => {
    localStorage.setItem('firewood-always-on-top', 'true');
    renderToggle();

    expect(pinButton().getAttribute('aria-pressed')).toBe('true');
    expect(pinButton().getAttribute('aria-label')).toBe('Unpin');
    expect(setAlwaysOnTop).toHaveBeenCalledWith(true);
  });

  it('toggles always-on-top on click and persists it', () => {
    renderToggle();

    const pin = pinButton();
    click(pin);
    expect(setAlwaysOnTop).toHaveBeenLastCalledWith(true);
    expect(pin.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('firewood-always-on-top')).toBe('true');

    click(pin);
    expect(setAlwaysOnTop).toHaveBeenLastCalledWith(false);
    expect(pin.getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem('firewood-always-on-top')).toBe('false');
  });

  it('falls back to unpinned on corrupt stored JSON', () => {
    localStorage.setItem('firewood-always-on-top', 'garbage{');
    renderToggle();

    expect(pinButton().getAttribute('aria-pressed')).toBe('false');
    expect(setAlwaysOnTop).toHaveBeenCalledWith(false);
  });

  it('falls back to unpinned on wrong-typed stored values (type guard)', () => {
    // Valid JSON, wrong type: without the isBoolean guard these would flow
    // into setAlwaysOnTop(non-boolean) and an invalid aria-pressed.
    for (const bad of ['null', '0', '"yes"']) {
      localStorage.setItem('firewood-always-on-top', bad);
      renderToggle();
      expect(pinButton().getAttribute('aria-pressed'), `stored ${bad}`).toBe('false');
      expect(setAlwaysOnTop).toHaveBeenLastCalledWith(false);
      act(() => root!.render(<div />));
    }
  });

  it('stays usable outside the Tauri runtime (getCurrentWindow throws synchronously)', () => {
    getCurrentWindowImpl.mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'metadata')");
    });
    renderToggle();

    expect(pinButton().getAttribute('aria-pressed')).toBe('false');

    const pin = pinButton();
    click(pin);
    expect(pin.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('firewood-always-on-top')).toBe('true');
  });

  it('keeps state and persists when setAlwaysOnTop rejects', async () => {
    setAlwaysOnTop.mockRejectedValueOnce(new Error('permission denied'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderToggle();

    const pin = pinButton();
    click(pin);
    await flush(0);

    expect(errorSpy).toHaveBeenCalledWith('Failed to set always-on-top', expect.any(Error));
    expect(pin.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('firewood-always-on-top')).toBe('true');
    errorSpy.mockRestore();
  });

  it('renders the tooltip with the requested placement', async () => {
    renderToggle('left');

    // React synthesizes onMouseEnter from mouseover (native mouseenter
    // events don't reach React's delegated listeners).
    act(() => {
      pinButton().dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, relatedTarget: null }));
    });
    await flush(300);

    // placement="left" is a hard rule for the titlebar pin (a default "top"
    // popup overflows the viewport edge → WKWebView shake; AGENTS.md).
    expect(document.querySelector('.ant-tooltip-placement-left')).toBeTruthy();
    expect(document.querySelector('.ant-tooltip-placement-top')).toBeNull();
  });
});
