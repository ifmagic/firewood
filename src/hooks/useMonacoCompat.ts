import { useMemo } from 'react';
import type { editor } from 'monaco-editor';

const DEFAULT_MONACO_FONT_FAMILY = "'JetBrains Mono', 'Fira Code', 'SFMono-Regular', ui-monospace, monospace";
const TAURI_MAC_MONACO_FONT_FAMILY =
  "'JetBrains Mono', 'Fira Code', 'SFMono-Regular', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', ui-monospace, monospace";

interface UseMonacoCompatParams {
  fontSize: number;
  options?: editor.IStandaloneEditorConstructionOptions;
  className?: string;
  tauriMacLineHeightMultiplier?: number;
}

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

/**
 * Platform-compat layer for Monaco in Tauri 2.
 *
 * On Tauri macOS (WKWebView) we apply opinionated overrides to keep CJK IME
 * input stable; on every other platform the caller's options pass through
 * unchanged aside from a shared default font stack:
 *   - CJK-aware font stack (PingFang SC / Hiragino Sans GB / Microsoft YaHei)
 *     so mixed Latin+CJK doesn't fall back to a system font mid-line.
 *   - lineHeight ~1.6x font-size: WKWebView's default leading clips PingFang SC
 *     descenders. Do not lower below ~1.45 or CJK lines clip. See commit 071192b.
 *   - editContext disabled: Monaco's new EditContext path causes IME caret
 *     flicker / mis-positioning on WKWebView. The classic textarea path is
 *     stable. AT users get the legacy textarea screen-reader path as a
 *     trade-off; revisit when upstream fixes the WKWebView EditContext IME bug.
 *   - IME textarea hidden via the .fw-monaco-compat--tauri-mac CSS class so the
 *     1px inputarea doesn't paint a ghost caret during composition. Verified
 *     on Tauri/macOS with a CJK IME: the OS candidate window remains the
 *     primary composition feedback.
 */
export function useMonacoCompat({
  fontSize,
  options,
  className,
  tauriMacLineHeightMultiplier = 1.6,
}: UseMonacoCompatParams) {
  const isTauriMac = useMemo(
    () =>
      typeof window !== 'undefined' &&
      // navigator.platform is deprecated but is the only reliable signal in
      // WKWebView (navigator.userAgentData is Chromium-only and unavailable
      // here). Do not "modernize" this or Mac detection breaks silently.
      navigator.platform.toLowerCase().includes('mac') &&
      '__TAURI_INTERNALS__' in window,
    [],
  );

  const editorClassName = useMemo(
    () => joinClassNames('fw-monaco-compat', isTauriMac && 'fw-monaco-compat--tauri-mac', className),
    [className, isTauriMac],
  );

  const editorOptions = useMemo(() => {
    const {
      fontFamily = isTauriMac ? TAURI_MAC_MONACO_FONT_FAMILY : DEFAULT_MONACO_FONT_FAMILY,
      lineHeight = isTauriMac ? Math.round(fontSize * tauriMacLineHeightMultiplier) : undefined,
      fontLigatures = false,
      allowVariableFonts = false,
      editContext = !isTauriMac,
      ...restOptions
    } = options ?? {};

    return {
      ...restOptions,
      fontSize,
      fontFamily,
      ...(typeof lineHeight === 'number' ? { lineHeight } : {}),
      fontLigatures,
      allowVariableFonts,
      editContext,
    };
  }, [fontSize, isTauriMac, options, tauriMacLineHeightMultiplier]);

  return {
    editorClassName,
    editorOptions,
    isTauriMac,
  };
}
