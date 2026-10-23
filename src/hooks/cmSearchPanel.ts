import type { Extension, Text } from '@codemirror/state';
import { EditorSelection } from '@codemirror/state';
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  search,
  setSearchQuery,
} from '@codemirror/search';
import { EditorView, runScopeHandlers, type Panel, type ViewUpdate } from '@codemirror/view';
import i18n from '../i18n';

/**
 * VS Code-style find/replace panel for CodeMirror 6, replacing the stock
 * SearchPanel via search({createPanel}). The stock panel's gaps vs VS Code:
 * no match count ("1 of 5"), no no-match feedback (VS Code reddens the input
 * and says "No results"), a permanently expanded replace row, and text-label
 * option checkboxes. This panel mirrors the VS Code widget — [▸ disclosure]
 * [find input][count] [Aa][ab|][.*] [↑][↓] [×], collapsed replace row with
 * Replace / Replace All, Enter=next / Shift+Enter=previous / Escape=close —
 * while keeping the bottom placement (the one thing the stock panel did that
 * users rely on). All match navigation/replacement still goes through the
 * stock @codemirror/search commands, so query state, seeding the query from
 * the selection, and the in-editor match highlighting stay stock.
 */

const MATCH_LIMIT = 1000;

interface MatchRange {
  from: number;
  to: number;
}

function elt<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  props: Record<string, unknown> = {},
  ...children: Array<Node | string | undefined>
): HTMLElementTagNameMap[Tag] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (name.startsWith('on') && typeof value === 'function') {
      el.addEventListener(name.slice(2).toLowerCase(), value as EventListener);
    } else if (name === 'class') {
      el.className = value as string;
    } else {
      el.setAttribute(name, value === true ? '' : String(value));
    }
  }
  for (const child of children) {
    if (child != null) el.append(child);
  }
  return el;
}

function icon(path: string) {
  const wrap = document.createElement('span');
  wrap.className = 'cm-searchIcon';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
  return wrap;
}

const CHEVRON = 'M4 10l4-4.5L12 10';
const CLOSE_PATH = 'M4.5 4.5l7 7M11.5 4.5l-7 7';

// Nested under '& .cm-panel.cm-search' so every rule out-specifies the stock
// base theme (`.cm-panel.cm-search input` etc. in @codemirror/search).
const searchPanelTheme = EditorView.theme({
  // De-bar the bottom panel strip: the stock full-width grey bar becomes a
  // transparent strip hosting the floating widget at its right edge.
  '& .cm-panels.cm-panels-bottom': {
    background: 'transparent',
    borderTop: 'none',
    padding: '0 10px 10px',
    color: '#1f1f1f',
  },
  '& .cm-panel.cm-search': {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    width: 'fit-content',
    minWidth: '372px',
    marginLeft: 'auto',
    padding: '4px',
    background: 'var(--fw-surface, #ffffff)',
    border: '1px solid #d9d9d9',
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.14)',
    fontSize: '12px',
    '& input, & button': { margin: 0 },
    '& .cm-searchRow': {
      display: 'flex',
      alignItems: 'center',
      gap: '3px',
    },
    '& .cm-searchReplaceRow[hidden]': { display: 'none' },
    '& .cm-searchField': {
      flex: 1,
      minWidth: '160px',
      height: '26px',
      padding: '0 8px',
      border: '1px solid #d9d9d9',
      borderRadius: '5px',
      background: '#ffffff',
      color: 'inherit',
      font: 'inherit',
      outline: 'none',
    },
    '& .cm-searchField:focus': { borderColor: 'var(--fw-accent, #ff7a45)' },
    '& .cm-searchField.cm-searchField-noMatch, & .cm-searchField.cm-searchField-invalid': {
      borderColor: 'var(--fw-danger, #e5484d)',
    },
    '& .cm-searchCount': {
      minWidth: '64px',
      textAlign: 'center',
      fontSize: '11px',
      color: '#8c8c8c',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    },
    '& .cm-searchBtn': {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '24px',
      height: '24px',
      padding: 0,
      border: 'none',
      borderRadius: '4px',
      background: 'transparent',
      color: '#595959',
      cursor: 'pointer',
      flexShrink: 0,
    },
    '& .cm-searchBtn:hover': { background: 'rgba(15, 23, 42, 0.07)', color: '#1f1f1f' },
    '& .cm-searchBtn:focus-visible': {
      outline: '2px solid color-mix(in srgb, var(--fw-accent, #ff7a45) 45%, transparent)',
      outlineOffset: '-1px',
    },
    '& .cm-searchToggle': { fontSize: '11px', fontWeight: 600 },
    '& .cm-searchToggle[aria-pressed="true"]': {
      background: 'var(--fw-accent-soft, #fff4ef)',
      color: 'var(--fw-accent-ink, #b54a1b)',
    },
    '& .cm-searchIcon svg': { display: 'block' },
    '& .cm-searchNext svg': { transform: 'rotate(180deg)' },
    '& .cm-searchReplaceToggle svg': { transform: 'rotate(90deg)' },
    '& .cm-searchReplaceToggle.is-open svg': { transform: 'rotate(180deg)' },
    '& .cm-searchReplaceField': {
      flex: 1,
      minWidth: '160px',
      height: '26px',
      padding: '0 8px',
      border: '1px solid #d9d9d9',
      borderRadius: '5px',
      background: '#ffffff',
      color: 'inherit',
      font: 'inherit',
      outline: 'none',
    },
    '& .cm-searchReplaceField:focus': { borderColor: 'var(--fw-accent, #ff7a45)' },
    '& .cm-searchReplaceBtn': {
      height: '24px',
      padding: '0 10px',
      border: '1px solid #d9d9d9',
      borderRadius: '4px',
      background: '#ffffff',
      color: '#1f1f1f',
      font: 'inherit',
      fontSize: '11px',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    },
    '& .cm-searchReplaceBtn:hover': {
      borderColor: 'var(--fw-accent, #ff7a45)',
      color: 'var(--fw-accent-ink, #b54a1b)',
    },
  },
  // In-editor match highlighting (VS Code tones: matches yellow, current orange).
  '& .cm-searchMatch': { background: 'rgba(255, 213, 79, 0.5)' },
  '& .cm-searchMatch-selected': { background: 'rgba(255, 138, 76, 0.55)' },
});

class FirewoodSearchPanel implements Panel {
  readonly dom: HTMLElement;
  readonly top = false;
  readonly pos = 80;

  private view: EditorView;
  private spec: SearchQuery;
  private caseOn: boolean;
  private wordOn: boolean;
  private reOn: boolean;
  private searchField: HTMLInputElement;
  private replaceField: HTMLInputElement;
  private caseButton: HTMLButtonElement;
  private wordButton: HTMLButtonElement;
  private reButton: HTMLButtonElement;
  private replaceRow: HTMLElement;
  private replaceToggle: HTMLButtonElement;
  private countEl: HTMLElement;
  private cache: { doc: Text; spec: SearchQuery; ranges: MatchRange[] | null } | null = null;

  constructor(view: EditorView) {
    this.view = view;
    this.spec = getSearchQuery(view.state);
    this.caseOn = this.spec.caseSensitive;
    this.wordOn = this.spec.wholeWord;
    this.reOn = this.spec.regexp;

    this.searchField = elt('input', {
      class: 'cm-searchField',
      type: 'text',
      placeholder: i18n.t('search.find'),
      'aria-label': i18n.t('search.find'),
      'main-field': 'true',
    });
    this.searchField.value = this.spec.search;
    this.searchField.addEventListener('input', () => this.commit());
    this.searchField.addEventListener('change', () => this.commit());

    this.replaceField = elt('input', {
      class: 'cm-searchReplaceField',
      type: 'text',
      placeholder: i18n.t('search.replace'),
      'aria-label': i18n.t('search.replace'),
    });
    this.replaceField.value = this.spec.replace;
    this.replaceField.addEventListener('input', () => this.commit());
    this.replaceField.addEventListener('change', () => this.commit());

    this.countEl = elt('span', { class: 'cm-searchCount', 'aria-live': 'polite' });

    const t = (key: string) => i18n.t(key);
    const toggle = (
      extraClass: string,
      glyph: string,
      label: string,
      isOn: () => boolean,
      set: (value: boolean) => void,
    ) => {
      const button = elt(
        'button',
        {
          type: 'button',
          class: `cm-searchBtn cm-searchToggle ${extraClass}`,
          title: label,
          'aria-label': label,
          'aria-pressed': 'false',
          onclick: () => {
            set(!isOn());
            button.setAttribute('aria-pressed', String(isOn()));
            this.commit();
          },
        },
        glyph,
      );
      button.setAttribute('aria-pressed', String(isOn()));
      return button;
    };
    this.caseButton = toggle(
      'cm-searchCaseToggle',
      'Aa',
      t('search.matchCase'),
      () => this.caseOn,
      (v) => {
        this.caseOn = v;
      },
    );
    this.wordButton = toggle(
      'cm-searchWordToggle',
      'ab|',
      t('search.wholeWord'),
      () => this.wordOn,
      (v) => {
        this.wordOn = v;
      },
    );
    this.reButton = toggle(
      'cm-searchRegexToggle',
      '.*',
      t('search.regexp'),
      () => this.reOn,
      (v) => {
        this.reOn = v;
      },
    );

    this.replaceToggle = elt(
      'button',
      {
        type: 'button',
        class: 'cm-searchBtn cm-searchReplaceToggle',
        title: t('search.toggleReplace'),
        'aria-label': t('search.toggleReplace'),
        'aria-expanded': 'false',
        onclick: () => this.setReplaceRow(this.replaceRow.hasAttribute('hidden')),
      },
      icon(CHEVRON),
    );

    const replaceRow = elt(
      'div',
      { class: 'cm-searchRow cm-searchReplaceRow', hidden: true },
      this.replaceField,
      elt(
        'button',
        {
          type: 'button',
          class: 'cm-searchReplaceBtn cm-searchReplaceOne',
          onclick: () => replaceNext(this.view),
        },
        t('search.replace'),
      ),
      elt(
        'button',
        {
          type: 'button',
          class: 'cm-searchReplaceBtn cm-searchReplaceAll',
          onclick: () => replaceAll(this.view),
        },
        t('search.replaceAll'),
      ),
    );
    this.replaceRow = replaceRow;

    const searchRow = elt(
      'div',
      { class: 'cm-searchRow' },
      ...(view.state.readOnly ? [] : [this.replaceToggle]),
      this.searchField,
      this.countEl,
      this.caseButton,
      this.wordButton,
      this.reButton,
      elt(
        'button',
        {
          type: 'button',
          class: 'cm-searchBtn cm-searchPrev',
          title: t('search.previousMatch'),
          'aria-label': t('search.previousMatch'),
          onclick: () => findPrevious(this.view),
        },
        icon(CHEVRON),
      ),
      elt(
        'button',
        {
          type: 'button',
          class: 'cm-searchBtn cm-searchNext',
          title: t('search.nextMatch'),
          'aria-label': t('search.nextMatch'),
          onclick: () => findNext(this.view),
        },
        icon(CHEVRON),
      ),
      elt(
        'button',
        {
          type: 'button',
          class: 'cm-searchBtn cm-searchClose',
          title: t('search.close'),
          'aria-label': t('search.close'),
          onclick: () => closeSearchPanel(this.view),
        },
        icon(CLOSE_PATH),
      ),
    );

    this.dom = elt(
      'div',
      { class: 'cm-search', onkeydown: (event: KeyboardEvent) => this.onKeyDown(event) },
      searchRow,
      ...(view.state.readOnly ? [] : [replaceRow]),
    );
  }

  mount() {
    this.searchField.focus();
    this.searchField.select();
    this.refreshCount();
  }

  update(update: ViewUpdate) {
    const spec = getSearchQuery(update.state);
    if (!spec.eq(this.spec)) {
      this.spec = spec;
      this.setQuery(spec);
    }
    this.refreshCount();
  }

  private setQuery(spec: SearchQuery) {
    this.searchField.value = spec.search;
    this.replaceField.value = spec.replace;
    this.caseOn = spec.caseSensitive;
    this.wordOn = spec.wholeWord;
    this.reOn = spec.regexp;
    this.caseButton.setAttribute('aria-pressed', String(this.caseOn));
    this.wordButton.setAttribute('aria-pressed', String(this.wordOn));
    this.reButton.setAttribute('aria-pressed', String(this.reOn));
  }

  private setReplaceRow(open: boolean) {
    if (open) this.replaceRow.removeAttribute('hidden');
    else this.replaceRow.setAttribute('hidden', '');
    this.replaceToggle.setAttribute('aria-expanded', String(open));
    this.replaceToggle.classList.toggle('is-open', open);
    if (open) this.replaceField.focus();
  }

  private commit() {
    const query = new SearchQuery({
      search: this.searchField.value,
      replace: this.replaceField.value,
      caseSensitive: this.caseOn,
      wholeWord: this.wordOn,
      regexp: this.reOn,
    });
    if (!query.eq(this.spec)) {
      // VS Code keeps the current match in sync with the query as you type:
      // the nearest match at/around the cursor is selected (and counted as
      // "i of n") immediately, not only after pressing Enter. Only a change
      // to the search terms re-anchors; typing a replacement must not move
      // the selection.
      const searchChanged =
        query.search !== this.spec.search ||
        query.caseSensitive !== this.spec.caseSensitive ||
        query.regexp !== this.spec.regexp ||
        query.wholeWord !== this.spec.wholeWord;
      this.spec = query;
      this.view.dispatch({ effects: setSearchQuery.of(query) });
      if (searchChanged) this.jumpToNearestMatch(query);
    }
    this.refreshCount();
  }

  private jumpToNearestMatch(spec: SearchQuery) {
    if (!spec.valid) return;
    const ranges = this.getMatches(spec);
    if (!ranges || ranges.length === 0) return;
    const from = this.view.state.selection.main.from;
    const match =
      ranges.find((range) => from >= range.from && from < range.to) ??
      ranges.find((range) => range.from >= from) ??
      ranges[0];
    this.view.dispatch({
      selection: EditorSelection.single(match.from, match.to),
      effects: EditorView.scrollIntoView(match.from),
      userEvent: 'select.search',
    });
  }

  private onKeyDown(event: KeyboardEvent) {
    // CJK IME: Enter while composing confirms the candidate, not the search.
    if (event.isComposing || event.keyCode === 229) return;
    // Stock search-panel scope bindings: Escape closes, F3/Mod-g navigate,
    // Mod-f refocuses the input.
    if (runScopeHandlers(this.view, event, 'search-panel')) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const target = event.target;
      if (target === this.searchField) {
        (event.shiftKey ? findPrevious : findNext)(this.view);
      } else if (target === this.replaceField) {
        replaceNext(this.view);
      }
    }
  }

  private computeMatches(spec: SearchQuery): MatchRange[] | null {
    if (!spec.valid) return [];
    const cursor = spec.getCursor(this.view.state);
    const ranges: MatchRange[] = [];
    for (;;) {
      const result = cursor.next();
      if (result.done) break;
      ranges.push({ from: result.value.from, to: result.value.to });
      if (ranges.length > MATCH_LIMIT) return null;
    }
    return ranges;
  }

  private getMatches(spec: SearchQuery): MatchRange[] | null {
    const { state } = this.view;
    if (this.cache && this.cache.doc === state.doc && this.cache.spec.eq(spec)) {
      return this.cache.ranges;
    }
    const ranges = this.computeMatches(spec);
    this.cache = { doc: state.doc, spec, ranges };
    return ranges;
  }

  private refreshCount() {
    const spec = getSearchQuery(this.view.state);
    const input = this.searchField;
    input.classList.remove('cm-searchField-noMatch', 'cm-searchField-invalid');
    let text = '';
    if (!spec.search) {
      // Empty query: neutral, nothing to report.
    } else if (spec.regexp && !spec.valid) {
      input.classList.add('cm-searchField-invalid');
      text = i18n.t('search.invalidRegex');
    } else {
      const ranges = this.getMatches(spec);
      if (ranges === null) {
        text = `${MATCH_LIMIT}+`;
      } else if (ranges.length === 0) {
        input.classList.add('cm-searchField-noMatch');
        text = i18n.t('search.noResults');
      } else {
        const sel = this.view.state.selection.main;
        let index = ranges.findIndex((range) => range.from === sel.from && range.to === sel.to);
        if (index < 0) index = ranges.findIndex((range) => sel.from >= range.from && sel.to <= range.to);
        text =
          index >= 0
            ? i18n.t('search.matchIndex', { index: index + 1, count: ranges.length })
            : i18n.t('search.resultsCount', { count: ranges.length });
      }
    }
    this.countEl.textContent = text;
  }
}

/**
 * The shared find/replace panel (AGENTS convention: mounted by useCodemirror
 * for every editor variant, alongside the stock searchKeymap).
 */
export function firewoodSearchPanel(): Extension {
  return [search({ createPanel: (view) => new FirewoodSearchPanel(view) }), searchPanelTheme];
}
