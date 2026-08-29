import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { message as antdMessage } from 'antd';
import CalculatorPanel from './CalculatorPanel';
import '../../i18n';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<CalculatorPanel />);
  });
}

function unmount() {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
}

const input = () => container?.querySelector<HTMLInputElement>('input.ant-input') ?? null;
const resultValue = () => container?.querySelector<HTMLElement>('[class*="resultValue"]') ?? null;
const histItems = () => [...(container?.querySelectorAll('[class*="histItem"]') ?? [])];

function typeIn(el: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter!.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function keyDown(el: Element, key: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

function blur(el: Element) {
  act(() => {
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}

function clickBtn(label: string) {
  const btn = [...(container?.querySelectorAll('button') ?? [])].find((b) => b.textContent === label);
  expect(btn, `button "${label}"`).toBeTruthy();
  act(() => {
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function clickOneOf(alternates: string[]) {
  const btn = [...(container?.querySelectorAll('button') ?? [])].find(
    (b) =>
      b.textContent === alternates[0] ||
      b.textContent === alternates[1] ||
      b.getAttribute('aria-label') === alternates[0] ||
      b.getAttribute('aria-label') === alternates[1],
  );
  expect(btn, `button one of ${alternates.join(' / ')}`).toBeTruthy();
  act(() => {
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function pressBackspace() {
  const btn = [...(container?.querySelectorAll('button') ?? [])].find((b) => b.textContent === '⌫');
  expect(btn, 'backspace button').toBeTruthy();
  act(() => {
    btn!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    btn!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });
}

function advanceDebounce() {
  act(() => {
    vi.advanceTimersByTime(400);
  });
}

function commitOnce(exprText: string) {
  typeIn(input()!, exprText);
  keyDown(input()!, 'Enter');
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.spyOn(antdMessage, 'success').mockImplementation(() => ({}) as never);
  mount();
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CalculatorPanel expression input', () => {
  it('mounts an editable input and focuses it (typing works immediately)', () => {
    const el = input();
    expect(el).toBeTruthy();
    expect(document.activeElement).toBe(el);
  });

  it('computes the preview result in the result area after typing', () => {
    typeIn(input()!, '1+2*3');
    advanceDebounce();
    expect(resultValue()?.textContent).toBe('7');
    expect(container?.textContent).toContain('0x7');
    expect(container?.textContent).toContain('0b111');
  });

  it('keeps the input mounted after blur and keypad clicks; typing keeps working (regression: no ghosting/no unmount)', () => {
    const el = input()!;
    typeIn(el, '1');
    blur(el);

    clickBtn('7');
    clickBtn('×');
    clickBtn('8');

    expect(input()).not.toBeNull();
    expect(input()?.value).toBe('17*8');
    expect(document.activeElement).toBe(input());

    advanceDebounce();
    expect(resultValue()?.textContent).toBe('136');
  });
});

describe('CalculatorPanel keys and shortcuts', () => {
  it('keypad digits and operators append to the expression', () => {
    clickBtn('7');
    clickBtn('×');
    clickBtn('8');
    advanceDebounce();
    expect(input()?.value).toBe('7*8');
    expect(resultValue()?.textContent).toBe('56');
  });

  it('"√" appends sqrt( and shows the incomplete ellipsis', () => {
    clickBtn('√');
    expect(input()?.value).toBe('sqrt(');
    advanceDebounce();
    expect(resultValue()?.textContent).toBe('…');
  });

  it('backspace button deletes the last character', () => {
    typeIn(input()!, '123');
    pressBackspace();
    expect(input()?.value).toBe('12');
  });

  it('Enter commits to history and clears the expression', () => {
    commitOnce('2+2');
    expect(input()?.value).toBe('');
    expect(histItems()).toHaveLength(1);
    expect(histItems()[0]?.textContent).toContain('2+2');
    expect(histItems()[0]?.textContent).toContain('4');
    expect(document.activeElement).toBe(input());
  });

  it('Escape clears the expression', () => {
    const el = input()!;
    typeIn(el, '123');
    keyDown(el, 'Escape');
    expect(input()?.value).toBe('');
  });

  it('equals key commits and clears the expression', () => {
    clickBtn('9');
    clickBtn('=');
    expect(histItems()).toHaveLength(1);
    expect(histItems()[0]?.textContent).toContain('9');
    expect(input()?.value).toBe('');
    expect(document.activeElement).toBe(input());
  });

  it('shows an error message for invalid expressions', () => {
    typeIn(input()!, '2+*3');
    advanceDebounce();
    expect(['表达式无效', 'Invalid expression']).toContain(resultValue()?.textContent);
  });
});

describe('CalculatorPanel history panel', () => {
  it('shows the latest 10 records by default and expands to all', () => {
    for (let i = 1; i <= 12; i++) commitOnce(`${i}+${i}`);
    expect(histItems()).toHaveLength(10);
    expect(histItems()[0]?.textContent).toContain('12+12');

    // Toggle shows the remaining records.
    clickOneOf(['展开全部（12 条）', 'Show all (12)']);
    expect(histItems()).toHaveLength(12);
    expect(histItems()[11]?.textContent).toContain('1+1');
  });

  it('clears history only after the inline confirmation', () => {
    commitOnce('2+2');
    expect(histItems()).toHaveLength(1);

    clickOneOf(['清空历史', 'Clear history']);
    expect(histItems()).toHaveLength(1); // still there, waiting for confirm

    clickOneOf(['确认清空', 'Confirm']);
    expect(histItems()).toHaveLength(0);
    const emptyText = container?.querySelector('[class*="histEmpty"]')?.textContent ?? '';
    expect(['暂无记录', 'No records']).toContain(emptyText);
  });

  it('clicking a record refills the expression input', () => {
    commitOnce('2+2');
    const rowBtn = histItems()[0]?.querySelector('button');
    expect(rowBtn).toBeTruthy();
    act(() => {
      rowBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(input()?.value).toBe('2+2');
  });
});
