import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { setAlwaysOnTop } = vi.hoisted(() => ({ setAlwaysOnTop: vi.fn(async () => {}) }));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ setAlwaysOnTop }),
}));

let TitleBar: (typeof import('./index'))['default'];
let container: HTMLDivElement | null = null;
let root: Root | null = null;

const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/620.1.15 (KHTML, like Gecko)';
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function stubUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

function renderBar() {
  act(() => {
    root!.render(<TitleBar />);
  });
}

beforeEach(async () => {
  localStorage.clear();
  setAlwaysOnTop.mockClear();
  stubUserAgent(MAC_UA);
  vi.resetModules();
  ({ default: TitleBar } = await import('./index'));
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

describe('TitleBar', () => {
  it('renders a drag-region strip with the pin button on the right (macOS)', () => {
    renderBar();

    const strip = container?.querySelector('[data-tauri-drag-region]') ?? null;
    expect(strip, 'drag-region strip').toBeTruthy();
    // No custom title text: the native title (next to the traffic lights)
    // already identifies the app — Overlay does not hide it.
    expect((strip as HTMLElement).textContent).toBe('');

    const pin = container?.querySelector('[aria-pressed]') as HTMLButtonElement | null;
    expect(pin, 'pin button').toBeTruthy();
    expect(pin!.getAttribute('aria-pressed')).toBe('false');
    expect(setAlwaysOnTop).toHaveBeenCalledWith(false);
  });

  it('applies a persisted pinned state on mount', () => {
    localStorage.setItem('firewood-always-on-top', 'true');
    renderBar();

    const pin = container?.querySelector('[aria-pressed]') as HTMLButtonElement | null;
    expect(pin!.getAttribute('aria-pressed')).toBe('true');
    expect(setAlwaysOnTop).toHaveBeenCalledWith(true);
  });

  it('renders nothing outside macOS', () => {
    stubUserAgent(WINDOWS_UA);
    renderBar();

    expect(container?.querySelector('[data-tauri-drag-region]')).toBeNull();
    expect(container?.querySelector('[aria-pressed]')).toBeNull();
    expect(setAlwaysOnTop).not.toHaveBeenCalled();
  });
});
