import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { FireOutlined } from '@ant-design/icons';
import '../../i18n';
import type { ToolMeta } from '../../types/tool';

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

const { setAlwaysOnTop } = vi.hoisted(() => ({ setAlwaysOnTop: vi.fn(async () => {}) }));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ setAlwaysOnTop }),
}));

let Sidebar: (typeof import('./index'))['default'];
let TitleBar: (typeof import('../TitleBar'))['default'];
let container: HTMLDivElement | null = null;
let root: Root | null = null;

const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/620.1.15 (KHTML, like Gecko)';
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function stubUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

const tools: ToolMeta[] = [
  {
    id: 'demo',
    name: 'Demo',
    icon: <FireOutlined />,
    description: '',
    component: (async () => ({ default: () => null })) as never,
  },
];

function renderSidebar() {
  act(() => {
    root!.render(
      <MemoryRouter>
        <Sidebar
          tools={tools}
          visibility={{ demo: true }}
          onToggleToolVisibility={vi.fn()}
          onReorder={vi.fn()}
          onToggleCollapsed={vi.fn()}
          collapsed={false}
        />
      </MemoryRouter>,
    );
  });
}

const click = (el: Element) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
};

beforeEach(async () => {
  localStorage.clear();
  setAlwaysOnTop.mockClear();
  vi.resetModules();
  ({ default: Sidebar } = await import('./index'));
  ({ default: TitleBar } = await import('../TitleBar'));
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

function renderSidebarAndTitleBar() {
  act(() => {
    root!.render(
      <MemoryRouter>
        <TitleBar />
        <Sidebar
          tools={tools}
          visibility={{ demo: true }}
          onToggleToolVisibility={vi.fn()}
          onReorder={vi.fn()}
          onToggleCollapsed={vi.fn()}
          collapsed={false}
        />
      </MemoryRouter>,
    );
  });
}

describe('Sidebar pin fallback (non-macOS)', () => {
  it('renders the pin in the sidebar footer on Windows and toggles it', () => {
    stubUserAgent(WINDOWS_UA);
    renderSidebar();

    // CSS modules hash .siderFooter, so target the pin by its stable aria attribute.
    const footerPin = container?.querySelector('[aria-pressed]') as HTMLButtonElement | null;
    expect(footerPin, 'footer pin').toBeTruthy();
    expect(footerPin!.getAttribute('aria-pressed')).toBe('false');
    expect(setAlwaysOnTop).toHaveBeenCalledWith(false);

    click(footerPin!);
    expect(setAlwaysOnTop).toHaveBeenLastCalledWith(true);
    expect(footerPin!.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('firewood-always-on-top')).toBe('true');
  });

  it('renders no pin in the sidebar footer on macOS', () => {
    stubUserAgent(MAC_UA);
    renderSidebar();

    expect(container?.querySelector('[aria-pressed]')).toBeNull();
    expect(setAlwaysOnTop).not.toHaveBeenCalled();
  });

  it('mounts exactly one pin per platform (TitleBar XOR sidebar footer)', () => {
    stubUserAgent(MAC_UA);
    renderSidebarAndTitleBar();
    expect(container!.querySelectorAll('[aria-pressed]')).toHaveLength(1);
    expect(container!.querySelector('[data-tauri-drag-region]')).toBeTruthy();

    stubUserAgent(WINDOWS_UA);
    renderSidebarAndTitleBar();
    expect(container!.querySelectorAll('[aria-pressed]')).toHaveLength(1);
    expect(container!.querySelector('[data-tauri-drag-region]')).toBeNull();
  });
});
