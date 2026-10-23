import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import { openSearchPanel, searchKeymap, searchPanelOpen } from '@codemirror/search';
import { firewoodSearchPanel } from './cmSearchPanel';

// The VS Code-style find/replace panel, exercised against the real
// @codemirror/search package (not a mock): the panel plugs into the stock
// search state via search({createPanel}), so query state, selection seeding
// and the match commands under test are the library's own.

const hosts: HTMLElement[] = [];
const views: EditorView[] = [];

function createEditor(doc: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [firewoodSearchPanel(), keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap])],
    }),
    parent: host,
  });
  views.push(view);
  return view;
}

afterEach(() => {
  while (views.length) views.pop()?.destroy();
  while (hosts.length) hosts.pop()?.remove();
});

afterAll(() => {
  localStorage.clear();
});

const panel = (view: EditorView) => {
  const el = view.dom.querySelector<HTMLElement>('.cm-panel.cm-search');
  expect(el, 'search panel').toBeTruthy();
  return el!;
};

const searchInput = (view: EditorView) => panel(view).querySelector<HTMLInputElement>('[main-field]')!;

const countText = (view: EditorView) => panel(view).querySelector<HTMLElement>('.cm-searchCount')!.textContent;

function typeQuery(view: EditorView, text: string, field: 'search' | 'replace' = 'search') {
  const input = panel(view).querySelector<HTMLInputElement>(
    field === 'search' ? '.cm-searchField' : '.cm-searchReplaceField',
  )!;
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function keydown(el: Element, key: string, opts: KeyboardEventInit = {}) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
}

describe('find panel (VS Code parity)', () => {
  it('opens at the bottom, focused, seeded from the selection', () => {
    const view = createEditor('alpha beta\ngamma alpha');
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    openSearchPanel(view);

    // Bottom placement is the one stock behavior users rely on.
    expect(view.dom.querySelector('.cm-panels-bottom .cm-panel.cm-search')).toBeTruthy();
    expect(searchInput(view).value).toBe('alpha');
    expect(document.activeElement).toBe(searchInput(view));
    // The selection is exactly the first match, so the count starts at "1 of 2".
    expect(countText(view)).toBe('1 of 2');
  });

  it('cycles matches with Enter / Shift+Enter and reports the current index', () => {
    const view = createEditor('alpha beta\ngamma alpha');
    // Park the cursor where no match contains it, so the first count reflects
    // the auto-jump rather than an already-selected match.
    view.dispatch({ selection: { anchor: 7, head: 7 } });
    openSearchPanel(view);
    typeQuery(view, 'alpha');

    // VS Code behavior: typing the query immediately selects the nearest
    // match at/after the cursor and reports it as "i of n".
    expect(countText(view)).toBe('2 of 2');
    expect(view.state.selection.main.from).toBe(17);

    const input = searchInput(view);
    keydown(input, 'Enter');
    expect(countText(view)).toBe('1 of 2');
    keydown(input, 'Enter');
    expect(countText(view)).toBe('2 of 2');
    keydown(input, 'Enter', { shiftKey: true });
    expect(countText(view)).toBe('1 of 2');
  });

  it('flags the no-match state on the input (VS Code red-border state)', () => {
    const view = createEditor('alpha beta');
    openSearchPanel(view);
    typeQuery(view, 'zzz');

    expect(countText(view)).toBe('No results');
    expect(searchInput(view).classList.contains('cm-searchField-noMatch')).toBe(true);
  });

  it('narrows and widens results with the option toggles', () => {
    const view = createEditor('Foo foo FOO');
    // Cursor inside the third match: the count tracks the current match.
    view.dispatch({ selection: { anchor: 9, head: 9 } });
    openSearchPanel(view);
    typeQuery(view, 'foo');
    expect(countText(view)).toBe('3 of 3');

    const caseToggle = panel(view).querySelector<HTMLElement>('.cm-searchCaseToggle')!;
    caseToggle.click();
    expect(caseToggle.getAttribute('aria-pressed')).toBe('true');
    expect(countText(view)).toBe('1 of 1');
    caseToggle.click();
    expect(countText(view)).toBe('2 of 3');
  });

  it('switches to regex matching and reports invalid patterns', () => {
    const view = createEditor('foo fao fuo');
    view.dispatch({ selection: { anchor: 5, head: 5 } });
    openSearchPanel(view);
    typeQuery(view, 'f.o');
    expect(countText(view)).toBe('No results');

    panel(view).querySelector<HTMLElement>('.cm-searchRegexToggle')!.click();
    expect(countText(view)).toBe('2 of 3');

    typeQuery(view, 'f[+');
    expect(countText(view)).toBe('Invalid regex');
    expect(searchInput(view).classList.contains('cm-searchField-invalid')).toBe(true);
  });

  it('keeps the replace row collapsed until toggled, then replace-all edits the doc', () => {
    const view = createEditor('foo bar\nfoo');
    openSearchPanel(view);

    const replaceRow = panel(view).querySelector<HTMLElement>('.cm-searchReplaceRow')!;
    expect(replaceRow.hasAttribute('hidden')).toBe(true);

    panel(view).querySelector<HTMLElement>('.cm-searchReplaceToggle')!.click();
    expect(replaceRow.hasAttribute('hidden')).toBe(false);

    typeQuery(view, 'foo');
    typeQuery(view, 'qux', 'replace');
    panel(view).querySelector<HTMLElement>('.cm-searchReplaceAll')!.click();

    expect(view.state.doc.toString()).toBe('qux bar\nqux');
    expect(countText(view)).toBe('No results');
  });

  it('closes on Escape', () => {
    const view = createEditor('alpha beta');
    openSearchPanel(view);
    expect(searchPanelOpen(view.state)).toBe(true);

    keydown(searchInput(view), 'Escape');
    expect(searchPanelOpen(view.state)).toBe(false);
  });

  it('caps the count display for very large match sets', () => {
    const view = createEditor(Array(1001).fill('a').join(' '));
    openSearchPanel(view);
    typeQuery(view, 'a');

    expect(countText(view)).toBe('1000+');
  });
});
