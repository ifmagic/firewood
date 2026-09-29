import type { CodemirrorLanguage } from '../hooks/useCodemirror';

/**
 * Leading-token language sniffing for the code-variant editor (notepad, text-diff).
 * Deliberately shallow: it only decides which parser/highlighter to attach, and a wrong
 * guess costs highlighting, never content. Shared so both tools agree on what counts as
 * JSON/HTML/JS.
 */
export function detectLanguage(text: string): CodemirrorLanguage {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (
    /^<(!doctype|html|div|span|head|body|p\b|ul|ol|li|table|form|a\b|img|section|article|nav|header|footer)/i.test(
      trimmed,
    )
  )
    return 'html';
  if (/^(import |export |const |let |var |function |class |=>|\/\/)/.test(trimmed)) return 'javascript';
  return 'plaintext';
}
