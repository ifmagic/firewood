import { applyEdits, format as formatJsonc } from 'jsonc-parser';

const jsoncFormatOptions = {
  tabSize: 2,
  insertSpaces: true,
  eol: '\n',
  keepLines: false,
} as const;

/**
 * Pretty-print JSON text with 2-space indentation. Valid JSON goes through a strict
 * parse + re-stringify; anything else falls back to the jsonc-parser formatter,
 * which best-effort formats invalid JSON / JSONC (comments, trailing commas)
 * without throwing.
 */
export function formatJsonText(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return applyEdits(text, formatJsonc(text, undefined, jsoncFormatOptions));
  }
}

/**
 * Remove JSON string escaping: unwraps a quoted payload (e.g. a double-stringified
 * JSON string) or unescapes bare `\"` content (e.g. escaped JSON inside log lines).
 * Throws when the text is not a parseable escaped JSON string.
 */
export function unescapeJsonText(text: string): string {
  let nextText = text.trim();
  if (nextText.startsWith('"') && nextText.endsWith('"')) {
    nextText = JSON.parse(nextText);
  } else {
    // Single-pass unescape; sequential .replace() chains mis-handle `\\`
    nextText = JSON.parse(`"${nextText}"`);
  }
  return nextText;
}
