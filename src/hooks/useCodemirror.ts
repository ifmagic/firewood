import { useCallback, useEffect, useRef } from 'react';
import { Compartment, EditorState, Transaction, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';

// Writing font stack: PingFang SC first for macOS CJK rendering; Source Han Sans SC as a
// cross-platform fallback; SF Pro Text for Latin glyphs. Unlike useMonacoCompat, a
// proportional font is more appropriate for long-form writing.
const WRITING_FONT_FAMILY =
  "'PingFang SC', 'Hiragino Sans GB', 'Source Han Sans SC', 'Microsoft YaHei', 'SF Pro Text', system-ui, sans-serif";

// Static theme: font stack, line height, caret color, focus outline removal.
// lineHeight 1.7 is the lower bound for PingFang SC in WKWebView without clipping descenders,
// matching the 1.6x multiplier in useMonacoCompat (CM6's default 1.4 would clip).
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

interface UseCodemirrorOptions {
  /** Controlled value. Parent changes are pushed down via a `changes` transaction; cursor is preserved when possible. */
  value: string;
  /** Callback on doc change; not fired during IME composition, fired once when composition ends. */
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Font size in px; runtime changes are reconfigured via Compartment without rebuilding the editor. */
  fontSize?: number;
  /** Show line numbers; defaults to false for writing editors. */
  showLineNumbers?: boolean;
  readOnly?: boolean;
  /** Extra extensions (e.g. lang-markdown in the future); only applied at mount time. */
  extensions?: Extension[];
  /** Callback after EditorView is created; callers should stabilize via useCallback. */
  onReady?: (view: EditorView) => void;
  autoFocus?: boolean;
  /**
   * When the content switches (e.g. between chapters), whether the external value pushed down
   * enters the undo history. Defaults to false (excluded from history) so Ctrl+Z does not
   * revert to the previous chapter's content. Set to true to allow undoing external changes.
   */
  externalChangeInHistory?: boolean;
}

/**
 * CodeMirror 6 wrapper hook. Corresponds to moxia QML's Editor.qml + firewood's useMonacoCompat.
 *
 * Handles:
 * - Multiple instances: each hook call gets its own EditorView, isolated.
 * - Controlled anti-loop: `applyingExternalValueRef` flag skips onChange when pushing external value.
 * - IME compatibility: `isComposingRef` + compositionend fallback prevent CJK input from being
 *   interrupted by parent re-renders.
 * - Dynamic font size: Compartment + EditorView.theme reconfigure, no editor rebuild.
 * - StrictMode double-mount: requestAnimationFrame + cancelled flag.
 * - Cross-chapter undo isolation: Transaction.addToHistory.of(false).
 *
 * AGENTS convention: any CodeMirror 6 integration must use this hook; do not reconfigure
 * fontFamily / lineHeight / fontSize / IME handling per tool.
 */
export function useCodemirror({
  value,
  onChange,
  placeholder: placeholderText,
  fontSize = 16,
  showLineNumbers = false,
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

  // Mirror the latest props into refs so updateListener doesn't re-subscribe on every render.
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // Anti-loop flag: set true while pushing an external value into the editor; updateListener skips onChange.
  const applyingExternalValueRef = useRef(false);

  // IME composition flag; consumers can read the returned isComposingRef to defer word-count refreshes.
  const isComposingRef = useRef(false);
  // docChanged events accumulated during composition; fired as a single onChange on compositionend.
  const pendingCompositionChangeRef = useRef(false);

  // Ref for externalChangeInHistory to avoid re-subscribing after mount.
  const inHistoryRef = useRef(externalChangeInHistory);
  useEffect(() => {
    inHistoryRef.current = externalChangeInHistory;
  }, [externalChangeInHistory]);

  // ---- font size live reconfigure ----
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: fontSizeCompartment.reconfigure(
        EditorView.theme({
          '&': { fontSize: `${fontSize}px` },
          '.cm-content': { fontSize: `${fontSize}px` },
        }),
      ),
    });
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
    view.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly, readOnlyCompartment]);

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
      annotations: Transaction.addToHistory.of(inHistoryRef.current),
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

    const state = EditorState.create({
      doc: value,
      extensions: [
        WRITING_THEME,
        EditorView.lineWrapping,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        highlightSelectionMatches(),
        fontSizeCompartment.of(
          EditorView.theme({
            '&': { fontSize: `${fontSize}px` },
            '.cm-content': { fontSize: `${fontSize}px` },
          }),
        ),
        placeholderCompartment.of(placeholderText ? cmPlaceholder(placeholderText) : []),
        readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
        showLineNumbers ? lineNumbers() : [],
        ...extraExtensions,
        // Single registration point: subscribe once at mount; onChange is read through the ref.
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return;
          if (applyingExternalValueRef.current) return;
          if (isComposingRef.current) {
            pendingCompositionChangeRef.current = true;
            return;
          }
          onChangeRef.current?.(u.state.doc.toString());
          pendingCompositionChangeRef.current = false;
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
            }
          },
        }),
      ],
    });

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
    };
    // Mount once. Re-running would destroy the editor and lose IME / cursor / scroll state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focus = useCallback(() => {
    viewRef.current?.focus();
  }, []);

  return { hostRef, viewRef, isComposingRef, focus };
}
