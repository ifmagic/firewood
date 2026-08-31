import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StrictMode } from 'react';
import { Tabs } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { message as antdMessage } from 'antd';
import TimestampPanel from './TimestampPanel';
import CalculatorPanel from './CalculatorPanel';
import '../../i18n';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(node?: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node ?? <TimestampPanel />);
  });
}

beforeEach(() => {
  if (!globalThis.ResizeObserver) {
    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  }
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

function unmount() {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
}

const pickerInput = () => document.querySelector<HTMLInputElement>('.ant-picker input');

function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  act(() => {
    el!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    el!.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  });
  act(() => {
    vi.advanceTimersByTime(300);
  });
}

function clickDay(day: number) {
  const cell = [...(document.querySelectorAll('.ant-picker-dropdown .ant-picker-cell-inner') ?? [])].find(
    (c) => c.textContent === String(day),
  );
  expect(cell, `date cell ${day}`).toBeTruthy();
  click(cell);
}

function clickHour(hour: string) {
  const cell = [...(document.querySelectorAll('.ant-picker-dropdown .ant-picker-time-panel-cell') ?? [])].find(
    (c) => c.textContent?.trim() === hour,
  );
  expect(cell, `hour cell ${hour}`).toBeTruthy();
  click(cell);
}

function clickOk() {
  const okBtn = [...(document.querySelectorAll('.ant-picker-ok button') ?? [])].find(
    (b) => b.textContent === 'OK' || b.textContent === '确定',
  );
  expect(okBtn, 'OK button').toBeTruthy();
  click(okBtn!);
}

function hover(el: Element | null) {
  expect(el).toBeTruthy();
  act(() => {
    el!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  });
  act(() => {
    vi.advanceTimersByTime(100);
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-09T12:00:00'));
  vi.spyOn(antdMessage, 'success').mockImplementation(() => ({}) as never);
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TimestampPanel DatePicker (date -> ts)', () => {
  it('does not commit when only a date cell is clicked (needConfirm)', () => {
    mount();
    click(pickerInput());
    clickDay(15);
    // antd v6 previews the hovered cell in the input, but nothing is committed
    // until OK is pressed — the date -> ts output rows must stay empty.
    expect(JSON.parse(localStorage.getItem('tool:numbox:ts:date') ?? 'null')).toBeNull();
    expect(document.querySelector('[class*="tsOutput"]')).toBeNull();
  });

  it('keeps the picked date while hovering time cells (no jump back to today)', () => {
    mount();
    click(pickerInput());
    clickDay(9);
    expect(pickerInput()?.value).toContain('2026-08-09');

    // Hovering a time cell previews "picked date + hovered time" — the date
    // must stay the picked one (regression: picked 9, display jumped to
    // today's 29 + time because the click never registered under the
    // clipped popup).
    const hourCell = [...(document.querySelectorAll('.ant-picker-dropdown .ant-picker-time-panel-cell') ?? [])].find(
      (c) => c.textContent?.trim() === '20',
    );
    expect(hourCell, 'hour cell 20').toBeTruthy();
    hover(hourCell!);

    expect(pickerInput()?.value).toBe('2026-08-09 20:00:00');
    expect(pickerInput()?.value).not.toContain('29');
  });

  it('renders the picker popup into document.body (never clipped by the section)', () => {
    mount();
    click(pickerInput());
    const dropdown = document.querySelector('.ant-picker-dropdown');
    expect(dropdown).toBeTruthy();
    expect(document.body.contains(dropdown)).toBe(true);
    expect(container?.contains(dropdown)).toBe(false);
  });

  it('keeps a mid-selection pick across the heartbeat when a previous value exists', () => {
    // Seed a persisted value: with a non-null controlled value, rc-picker
    // re-syncs the panel to the controlled value whenever `value` changes
    // identity; the 1s nowTick re-render creates a fresh dayjs() each time,
    // which used to reset any in-progress selection back to the persisted one.
    localStorage.setItem('tool:numbox:ts:date', JSON.stringify('2026-08-09T12:41:12.000Z'));
    mount();
    click(pickerInput());
    clickDay(15);
    expect(pickerInput()?.value).toContain('2026-08-15');

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(pickerInput()?.value).toContain('2026-08-15');
    expect(pickerInput()?.value).not.toContain('2026-08-09');
  });

  it('dedupes only consecutive repeats; re-selecting an older value records again', () => {
    mount();
    const histItems = () => [...(document.querySelectorAll('[class*="histItem"]') ?? [])];

    const pick = (day: number) => {
      click(pickerInput());
      clickDay(day);
      clickOk();
      act(() => {
        vi.advanceTimersByTime(700); // debounced record effect
      });
    };

    pick(15);
    expect(histItems()).toHaveLength(1);
    pick(15); // consecutive re-pick of the same value must not duplicate
    expect(histItems()).toHaveLength(1);
    pick(20);
    expect(histItems()).toHaveLength(2);
    pick(15); // re-selecting an already recorded value after another pick records again
    expect(histItems()).toHaveLength(3);
  });

  it('records after clearing history', () => {
    mount();
    const histItems = () => [...(document.querySelectorAll('[class*="histItem"]') ?? [])];

    const pick = (day: number) => {
      click(pickerInput());
      clickDay(day);
      clickOk();
      act(() => {
        vi.advanceTimersByTime(700); // debounced record effect
      });
    };

    pick(15);
    expect(histItems()).toHaveLength(1);

    const clearBtn = document.querySelector('[class*="histClearBtn"]');
    expect(clearBtn).toBeTruthy();
    click(clearBtn!);
    const confirmBtn = [...(document.querySelectorAll('.ant-btn') ?? [])].find(
      (b) => b.textContent === 'Confirm' || b.textContent === '确认清空',
    );
    expect(confirmBtn).toBeTruthy();
    click(confirmBtn!);
    expect(histItems()).toHaveLength(0);

    pick(20);
    expect(histItems()).toHaveLength(1);
  });

  it('commits date + picked time on OK; the value survives the 1s heartbeat re-render', () => {
    mount();
    click(pickerInput());
    clickDay(15);
    clickHour('09');
    clickOk();

    const picked = pickerInput()?.value;
    expect(picked).toBe('2026-08-15 09:00:00');

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(pickerInput()?.value).toBe(picked);
  });

  it('keeps the picked value across Tabs remount (destroyOnHidden + StrictMode)', () => {
    const tabs = (
      <StrictMode>
        <Tabs
          destroyOnHidden
          items={[
            {
              key: 'calc',
              label: 'Calc',
              children: (
                <div>
                  <CalculatorPanel />
                </div>
              ),
            },
            {
              key: 'ts',
              label: 'Ts',
              children: (
                <div>
                  <TimestampPanel />
                </div>
              ),
            },
          ]}
        />
      </StrictMode>
    );
    mount(tabs);

    click([...(document.querySelectorAll('.ant-tabs-tab') ?? [])].find((el) => el.textContent === 'Ts'));
    click(pickerInput());
    clickDay(15);
    clickHour('09');
    clickOk();
    const picked = pickerInput()?.value;
    expect(picked).toBe('2026-08-15 09:00:00');

    click([...(document.querySelectorAll('.ant-tabs-tab') ?? [])].find((el) => el.textContent === 'Calc'));
    click([...(document.querySelectorAll('.ant-tabs-tab') ?? [])].find((el) => el.textContent === 'Ts'));
    expect(pickerInput()?.value).toBe(picked);
  });
});
