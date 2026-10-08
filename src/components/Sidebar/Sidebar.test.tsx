import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { FireOutlined } from '@ant-design/icons';
import i18n from '../../i18n';
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

// The full window surface: the Windows TitleBar strip (mounted alongside the
// sidebar in the XOR test) reads isMaximized and subscribes to onResized.
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    setAlwaysOnTop,
    startDragging: vi.fn(async () => {}),
    toggleMaximize: vi.fn(async () => {}),
    minimize: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    isMaximized: vi.fn(async () => false),
    onResized: vi.fn(async () => () => {}),
  }),
}));

let Sidebar: (typeof import('./index'))['default'];
let TitleBar: (typeof import('../TitleBar'))['default'];
let container: HTMLDivElement | null = null;
let root: Root | null = null;

const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/620.1.15 (KHTML, like Gecko)';
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)';

function stubUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

const tools: ToolMeta[] = [
  {
    id: 'demo',
    name: 'Demo',
    icon: <FireOutlined />,
    component: (async () => ({ default: () => null })) as never,
  },
];

function renderSidebar(collapsed = false) {
  act(() => {
    root!.render(
      <MemoryRouter>
        <Sidebar
          tools={tools}
          visibility={{ demo: true }}
          onToggleToolVisibility={vi.fn()}
          onReorder={vi.fn()}
          onToggleCollapsed={vi.fn()}
          collapsed={collapsed}
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

describe('Sidebar pin surface (Linux only)', () => {
  const byLabel = (label: string) => container!.querySelector(`[aria-label="${label}"]`);

  it('renders the pin in the header top chrome row on Linux and toggles it', () => {
    stubUserAgent(LINUX_UA);
    renderSidebar();

    // CSS modules hash the class names, so target the pin by its stable aria
    // attribute and pin down its slot structurally: same row as the view menu
    // (the header's top chrome), trailing both header controls (the flex row's
    // last child), never the settings footer. The lookup anchors keep the
    // negative assertions from passing vacuously on a null (contains(null) is
    // false), which is the exact regression this guards against.
    const headerPin = container?.querySelector('[aria-pressed]') as HTMLButtonElement | null;
    expect(headerPin, 'header pin').toBeTruthy();
    expect(headerPin!.getAttribute('aria-pressed')).toBe('false');
    expect(setAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(byLabel(i18n.t('sidebar.viewMenu')), 'view menu').toBeTruthy();
    expect(byLabel(i18n.t('label.settings')), 'settings button').toBeTruthy();
    expect(headerPin!.parentElement!.contains(byLabel(i18n.t('sidebar.viewMenu')))).toBe(true);
    expect(headerPin!.parentElement!.contains(byLabel(i18n.t('label.settings')))).toBe(false);
    expect(headerPin!.parentElement!.lastElementChild).toBe(headerPin);

    click(headerPin!);
    expect(setAlwaysOnTop).toHaveBeenLastCalledWith(true);
    expect(headerPin!.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('firewood-always-on-top')).toBe('true');
  });

  it('keeps the pin trailing the brand in the collapsed rail header', () => {
    stubUserAgent(LINUX_UA);
    renderSidebar(true);

    const railPin = container?.querySelector('[aria-pressed]') as HTMLButtonElement | null;
    expect(railPin, 'rail pin').toBeTruthy();
    // The rail has no view menu; the pin shares the header with the brand
    // button instead — stacked after it by flex-direction: column — and stays
    // clear of the settings footer.
    expect(byLabel(i18n.t('sidebar.viewMenu')), 'view menu (collapsed)').toBeNull();
    expect(byLabel(i18n.t('sidebar.expand')), 'brand button').toBeTruthy();
    expect(byLabel(i18n.t('label.settings')), 'settings button').toBeTruthy();
    expect(railPin!.parentElement!.contains(byLabel(i18n.t('sidebar.expand')))).toBe(true);
    expect(railPin!.parentElement!.contains(byLabel(i18n.t('label.settings')))).toBe(false);
    expect(railPin!.parentElement!.lastElementChild).toBe(railPin);
  });

  it('renders no pin on macOS or Windows (their titlebar strips own it)', () => {
    for (const ua of [MAC_UA, WINDOWS_UA]) {
      stubUserAgent(ua);
      for (const collapsed of [false, true]) {
        renderSidebar(collapsed);
        expect(container?.querySelector('[aria-pressed]'), `${ua.slice(0, 20)} collapsed=${collapsed}`).toBeNull();
      }
    }
    expect(setAlwaysOnTop).not.toHaveBeenCalled();
  });

  it('mounts exactly one pin per platform (TitleBar XOR sidebar header)', () => {
    // macOS: overlay strip. Windows: custom titlebar caption row. Linux:
    // sidebar header. Every combination mounts exactly one PinToggle.
    const expectations: Array<[string, boolean]> = [
      [MAC_UA, true],
      [WINDOWS_UA, true],
      [LINUX_UA, false],
    ];
    for (const [ua, stripOwnsPin] of expectations) {
      stubUserAgent(ua);
      renderSidebarAndTitleBar();
      expect(container!.querySelectorAll('[aria-pressed]'), ua.slice(0, 20)).toHaveLength(1);
      expect(container!.querySelector('[data-tauri-drag-region]') !== null, ua.slice(0, 20)).toBe(stripOwnsPin);
    }
  });
});
