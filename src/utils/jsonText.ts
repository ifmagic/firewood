import {
  applyEdits,
  format as formatJsonc,
  parse as parseJsonc,
  printParseErrorCode,
  type ParseError,
} from 'jsonc-parser';

const jsoncFormatOptions = {
  tabSize: 2,
  insertSpaces: true,
  eol: '\n',
  keepLines: false,
} as const;

const jsoncParseOptions = { allowTrailingComma: true } as const;

/**
 * Describe a jsonc-parser error as `<code> (line L, column C)` so failure
 * messages point at where the input breaks.
 */
function describeParseError(text: string, { error, offset }: ParseError): string {
  const clamped = Math.min(Math.max(offset, 0), text.length);
  const lines = text.slice(0, clamped).split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return `${printParseErrorCode(error)} (line ${line}, column ${column})`;
}

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
 * Minify JSON text onto a single line. Mirrors `formatJsonText`'s tolerance:
 * valid JSON goes through a strict parse + re-stringify; JSONC (comments,
 * trailing commas) is accepted via jsonc-parser with comments dropped.
 * Genuinely invalid text throws an Error whose message names the first parse
 * error and its line/column.
 */
export function minifyJsonText(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    const errors: ParseError[] = [];
    const parsed = parseJsonc(text, errors, jsoncParseOptions);
    if (errors.length > 0) {
      throw new Error(describeParseError(text, errors[0]));
    }
    if (parsed === undefined) {
      throw new Error('ValueExpected (empty content)');
    }
    return JSON.stringify(parsed);
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
