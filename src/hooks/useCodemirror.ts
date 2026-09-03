import { useCallback, useEffect, useRef } from 'react';
import { Compartment, EditorState, Transaction, type Extension } from '@codemirror/state';
import {
  EditorView,
  ViewUpdate,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as cmPlaceholder,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, isolateHistory } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { HighlightStyle, bracketMatching, foldGutter, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { autocompletion, closeBrackets } from '@codemirror/autocomplete';
import { json } from '@codemirror/lang-json';
import { tags as t } from '@lezer/highlight';

export type CodemirrorVariant = 'writing' | 'code';
export type CodemirrorLanguage = 'json' | 'html' | 'javascript' | 'plaintext';

// Writing font stack: PingFang SC first for macOS CJK rendering; Source Han Sans SC as a
// cross-platform fallback; SF Pro Text for Latin glyphs. A proportional font is more
// appropriate for long-form writing.
const WRITING_FONT_FAMILY =
  "'PingFang SC', 'Hiragino Sans GB', 'Source Han Sans SC', 'Microsoft YaHei', 'SF Pro Text', system-ui, sans-serif";

// Static writing theme: font stack, line height, caret color, focus outline removal.
// lineHeight 1.7 is the lower bound for PingFang SC in WKWebView without clipping descenders.
const WRITING_THEME = EditorView.theme({
  '&': {
    fontFamily: WRITING_FONT_FAMILY,
    height: '100%',
    backgroundColor: 'transparent',
  },
  '.cm-content': {
    fontFamily: WRITING_FONT_FAMILY,
    lineHeight: '1.7',
    padding: '16px 20px',
    caretColor: 'var(--fw-accent, #EF4444)',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--fw-accent, #EF4444)',
    borderLeftWidth: '2px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    borderRight: '1px solid var(--fw-divider, #eeeeee)',
    color: '#94A3B8',
  },
  '.cm-placeholder': {
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  '.cm-selectionBackground': {
    backgroundColor: '#CBD5E199 !important',
  },
});

// Code font stacks mirror the former useMonacoCompat layer: on Tauri macOS (WKWebView) the
// CJK-aware fallbacks keep mixed Latin+CJK from falling back to a system font mid-line.
// navigator.platform is deprecated but is the only reliable signal in WKWebView; do not
// "modernize" this or Mac detection breaks silently.
const IS_TAURI_MAC =
  typeof window !== 'undefined' && navigator.platform.toLowerCase().includes('mac') && '__TAURI_INTERNALS__' in window;

const CODE_FONT_FAMILY = "'JetBrains Mono', 'Fira Code', 'SFMono-Regular', ui-monospace, monospace";
const TAURI_MAC_CODE_FONT_FAMILY =
  "'JetBrains Mono', 'Fira Code', 'SFMono-Regular', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', ui-monospace, monospace";

const CODE_FONT = IS_TAURI_MAC ? TAURI_MAC_CODE_FONT_FAMILY : CODE_FONT_FAMILY;

// Code theme ports the former Monaco `firewood-contrast-light` theme one-to-one. lineHeight 1.6
// matches the WKWebView-safe multiplier the Monaco layer required.
const CODE_THEME = EditorView.theme({
  '&': {
    fontFamily: CODE_FONT,
    height: '100%',
    backgroundColor: '#FBFBFC',
    color: '#0F172A',
  },
  '.cm-content': {
    fontFamily: CODE_FONT,
    lineHeight: '1.6',
    caretColor: '#EF4444',
  },
  '.cm-cursor': {
    borderLeftColor: '#EF4444',
    borderLeftWidth: '2px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-gutters': {
    backgroundColor: '#FBFBFC',
    color: '#94A3B8',
  },
  '.cm-activeLineGutter': { color: '#334155' },
  '.cm-activeLine': { backgroundColor: '#F5F6F8' },
  '.cm-selectionBackground': {
    backgroundColor: '#CBD5E199 !important',
  },
  '.cm-matchingBracket': { backgroundColor: '#E2E8F0' },
  '.cm-placeholder': {
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  // CM's lint squiggle is a 6x3px SVG at background-position "left bottom".
  // With lineHeight 1.6 the line box has tall bottom leading, so the squiggle
  // rendered ~6px below the text and read as a detached grey box. Anchor it
  // just under the text baseline instead.
  '.cm-lintRange': {
    backgroundPosition: 'left calc(100% - 3px)',
    paddingBottom: '0px',
  },
});

// Token colors port the Monaco firewood-contrast-light rules.
const CODE_HIGHLIGHT_STYLE = HighlightStyle.define([
  { tag: t.comment, color: '#6B7280', fontStyle: 'italic' },
  { tag: t.keyword, color: '#7C3AED' },
  { tag: t.number, color: '#B45309' },
  { tag: t.string, color: '#047857' },
  { tag: t.regexp, color: '#0369A1' },
  { tag: [t.typeName, t.className], color: '#1D4ED8' },
]);

/**
 * Language parsers, keyed by language. json is tiny and used by json-formatter,
 * so it stays static; html/javascript parsers are heavy (~230KB raw combined,
 * only notepad uses them) and load lazily so they stay out of the shared
 * useCodemirror chunk (keeps it under the 500KB chunk warning threshold).
 */
const lazyLanguageExtensions: Partial<Record<CodemirrorLanguage, () => Promise<{ extension: Extension }>>> = {
  html: async () => ({ extension: (await import('@codemirror/lang-html')).html() }),
  javascript: async () => ({ extension: (await import('@codemirror/lang-javascript')).javascript() }),
};

function codeLanguageExtension(language: CodemirrorLanguage): Extension {
  switch (language) {
    case 'json':
      return json();
    case 'html':
    case 'javascript':
      // Placeholder until the async load lands; reconfigured by the load effect below.
      return [];
    default:
      return [];
  }
}

function fontSizeTheme(fontSize: number): Extension {
  return EditorView.theme({
    '&': { fontSize: `${fontSize}px` },
    '.cm-content': { fontSize: `${fontSize}px` },
  });
}

interface UseCodemirrorOptions {
  /** Controlled value. Parent changes are pushed down via a `changes` transaction; cursor is preserved when possible. */
  value: string;
  /** Callback on doc change; not fired during IME composition, fired once when composition ends. */
  onChange?: (value: string) => void;
  /**
   * Callback on doc/selection change with the same IME deferral as onChange. For stats-style
   * consumers (status bars); fires on selection-only changes too, unlike onChange.
   */
  onUpdate?: (update: ViewUpdate) => void;
  placeholder?: string;
  /** Font size in px; runtime changes are reconfigured via Compartment without rebuilding the editor. */
  fontSize?: number;
  /** 'writing': proportional plain-text editor; 'code': monospace + line numbers + folding + highlighting. Defaults to 'writing'. */
  variant?: CodemirrorVariant;
  /** Syntax language for variant 'code'; runtime changes are reconfigured via Compartment. Defaults to 'plaintext'. */
  language?: CodemirrorLanguage;
  /** Soft-wrap lines. Defaults to true. Mount-only. */
  wrap?: boolean;
  /** Show line numbers; defaults to false for 'writing' and true for 'code'. Mount-only. */
  showLineNumbers?: boolean;
  readOnly?: boolean;
  /** Extra extensions (e.g. linters); only applied at mount time. */
  extensions?: Extension[];
  /** Callback after EditorView is created; callers should stabilize via useCallback. */
  onReady?: (view: EditorView) => void;
  autoFocus?: boolean;
  /**
   * When the content switches (e.g. between chapters/tabs), whether the external value pushed down
   * enters the undo history. Defaults to false (excluded from history, and the transaction is marked
   * isolateHistory 'before' so undo cannot cross the content boundary).
   */
  externalChangeInHistory?: boolean;
}

/**
 * CodeMirror 6 wrapper hook. The single entry point for all editor scenarios (AGENTS convention).
 *
 * Handles:
 * - Multiple instances: each hook call gets its own EditorView, isolated.
 * - Controlled anti-loop: `applyingExternalValueRef` flag skips onChange when pushing external value.
 * - IME compatibility: `isComposingRef` + compositionend fallback prevent CJK input from being
 *   interrupted by parent re-renders.
 * - Dynamic font size: Compartment + EditorView.theme reconfigure, no editor rebuild.
 * - StrictMode double-mount: requestAnimationFrame + cancelled flag.
 * - Cross-content undo isolation: external pushes are excluded from history and marked
 *   isolateHistory 'before', so Ctrl+Z cannot revert into the previous chapter/tab content.
 */
export function useCodemirror({
  value,
  onChange,
  onUpdate,
  placeholder: placeholderText,
  fontSize = 16,
  variant = 'writing',
  language = 'plaintext',
  wrap = true,
  showLineNumbers,
  readOnly = false,
  extensions: extraExtensions = [],
  onReady,
  autoFocus = false,
  externalChangeInHistory = false,
}: UseCodemirrorOptions) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Compartment instances must be stable across renders, otherwise reconfigure has no effect.
  const fontSizeCompartment = useRef(new Compartment()).current;
  const placeholderCompartment = useRef(new Compartment()).current;
  const readOnlyCompartment = useRef(new Compartment()).current;
  const languageCompartment = useRef(new Compartment()).current;

  // Mirror the latest props into refs so updateListener doesn't re-subscribe on every render.
  const onChangeRef = useRef(onChange);
  const onUpdateRef = useRef(onUpdate);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // Anti-loop flag: set true while pushing an external value into the editor; updateListener skips onChange.
  const applyingExternalValueRef = useRef(false);

  // IME composition flag; consumers can read the returned isComposingRef to defer word-count refreshes.
  const isComposingRef = useRef(false);
  // docChanged events accumulated during composition; fired as a single onChange on compositionend.
  const pendingCompositionChangeRef = useRef(false);
  // Last update accumulated during composition, replayed to onUpdate on compositionend.
  const pendingCompositionUpdateRef = useRef<ViewUpdate | null>(null);

  // Ref for externalChangeInHistory to avoid re-subscribing after mount.
  const inHistoryRef = useRef(externalChangeInHistory);
  useEffect(() => {
    inHistoryRef.current = externalChangeInHistory;
  }, [externalChangeInHistory]);

  const resolvedShowLineNumbers = showLineNumbers ?? variant === 'code';

  // ---- font size live reconfigure ----
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: fontSizeCompartment.reconfigure(fontSizeTheme(fontSize)) });
  }, [fontSize, fontSizeCompartment]);

  // ---- placeholder live reconfigure ----
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: placeholderCompartment.reconfigure(placeholderText ? cmPlaceholder(placeholderText) : []),
    });
  }, [placeholderText, placeholderCompartment]);

  // ---- readOnly live reconfigure ----
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)) });
  }, [readOnly, readOnlyCompartment]);

  // ---- language live reconfigure (code variant) ----
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    let cancelled = false;
    // Instantly apply the static part (json or empty placeholder), then upgrade
    // to the lazy parser when it arrives. Guarded against races when the user
    // flips languages faster than the dynamic import resolves.
    view.dispatch({ effects: languageCompartment.reconfigure(codeLanguageExtension(language)) });
    const lazy = lazyLanguageExtensions[language];
    if (lazy) {
      lazy().then(({ extension }) => {
        if (cancelled) return;
        const current = viewRef.current;
        if (!current) return;
        current.dispatch({ effects: languageCompartment.reconfigure(extension) });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [language, languageCompartment]);

  // ---- controlled value sync: push down only when external value differs from current doc, preserve cursor ----
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    // Don't push external value while IME is composing, otherwise the in-progress CJK text is overwritten.
    if (isComposingRef.current) return;
    applyingExternalValueRef.current = true;
    const prevSel = view.state.selection.main;
    const tr = view.state.update({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: {
        anchor: Math.min(prevSel.anchor, value.length),
        head: Math.min(prevSel.head, value.length),
      },
      annotations: [
        Transaction.addToHistory.of(inHistoryRef.current),
        ...(inHistoryRef.current ? [] : [isolateHistory.of('before')]),
      ],
    });
    view.dispatch(tr);
    applyingExternalValueRef.current = false;
  }, [value]);

  // ---- mount / unmount (StrictMode double-mount safe) ----
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let view: EditorView | null = null;
    let cancelled = false;

    const extensions: Extension[] = [
      variant === 'code' ? CODE_THEME : WRITING_THEME,
      wrap ? EditorView.lineWrapping : [],
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      highlightSelectionMatches(),
      fontSizeCompartment.of(fontSizeTheme(fontSize)),
      placeholderCompartment.of(placeholderText ? cmPlaceholder(placeholderText) : []),
      readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
      resolvedShowLineNumbers ? lineNumbers() : [],
    ];

    // Code variant deliberately does NOT use drawSelection(): its cursor/selection layers are
    // positioned from getClientRects() measurements, which misrender in Tauri's WKWebView
    // (cursor drawn at a wrong spot after clicking doc start; selection background not
    // painted, so Shift+Arrow looks dead). Native caret/selection rendering — as used by
    // the writing variant — is reliable there. Do not re-add.
    if (variant === 'code') {
      extensions.push(
        syntaxHighlighting(CODE_HIGHLIGHT_STYLE),
        languageCompartment.of(codeLanguageExtension(language)),
        foldGutter(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        indentUnit.of('  '),
      );
    }

    extensions.push(
      ...extraExtensions,
      // Single registration point: subscribe once at mount; callbacks are read through refs.
      EditorView.updateListener.of((u) => {
        if (!u.docChanged && !u.selectionSet) return;
        if (applyingExternalValueRef.current) return;
        if (isComposingRef.current) {
          pendingCompositionChangeRef.current = true;
          pendingCompositionUpdateRef.current = u;
          return;
        }
        if (u.docChanged) {
          onChangeRef.current?.(u.state.doc.toString());
        }
        pendingCompositionChangeRef.current = false;
        onUpdateRef.current?.(u);
      }),
      // IME: CodeMirror 6's native IME in WKWebView goes through the contentEditable path,
      // which is more stable than Monaco's EditContext. We only maintain isComposingRef so
      // updateListener does not fire onChange during composition, preventing CJK input from
      // being interrupted by parent re-renders.
      EditorView.domEventHandlers({
        compositionstart: () => {
          isComposingRef.current = true;
        },
        compositionend: (_event, v) => {
          isComposingRef.current = false;
          if (pendingCompositionChangeRef.current) {
            pendingCompositionChangeRef.current = false;
            onChangeRef.current?.(v.state.doc.toString());
            const pendingUpdate = pendingCompositionUpdateRef.current;
            pendingCompositionUpdateRef.current = null;
            if (pendingUpdate) {
              onUpdateRef.current?.(pendingUpdate);
            }
          }
        },
      }),
    );

    const state = EditorState.create({ doc: value, extensions });

    // StrictMode in dev does mount → cleanup → mount. Use rAF + a cancelled flag so the
    // first mount does not create an EditorView after cleanup has run.
    const raf = requestAnimationFrame(() => {
      if (cancelled || !host) return;
      view = new EditorView({ state, parent: host });
      viewRef.current = view;
      if (autoFocus) view.focus();
      onReadyRef.current?.(view);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      view?.destroy();
      viewRef.current = null;
      isComposingRef.current = false;
      pendingCompositionChangeRef.current = false;
      pendingCompositionUpdateRef.current = null;
    };
    // Mount once. Re-running would destroy the editor and lose IME / cursor / scroll state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focus = useCallback(() => {
    viewRef.current?.focus();
  }, []);

  return { hostRef, viewRef, isComposingRef, focus };
}
