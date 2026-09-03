/**
 * JSONC-aware linter for the json-formatter.
 *
 * The tool's format action tolerates JSONC (comments, trailing commas) via a
 * jsonc-parser fallback, so linting must not flag what formatting accepts.
 * `@codemirror/lang-json`'s `jsonParseLinter` is strict JSON and underlines
 * comments/trailing commas as errors — a false positive here. This linter
 * reports exactly the errors jsonc-parser finds with JSONC options enabled,
 * so genuinely broken input (e.g. a pasted log line before a JSON object)
 * still gets marked.
 */
import { linter, type Diagnostic } from '@codemirror/lint';
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';

const PARSE_OPTIONS = { allowTrailingComma: true, allowEmptyContent: true } as const;

export interface JsoncDiagnostic {
  from: number;
  to: number;
  message: string;
  severity: 'error';
}

/**
 * Pure text → diagnostics mapping (unit-testable without an EditorView).
 * Positions are clamped to the given max length by the caller (the CM linter
 * wrapper does the final clamp against the real doc).
 */
export function jsoncDiagnostics(text: string, maxLength = text.length): JsoncDiagnostic[] {
  const errors: ParseError[] = [];
  parse(text, errors, PARSE_OPTIONS);
  const seen = new Set<string>();
  const result: JsoncDiagnostic[] = [];
  for (const { error, offset, length } of errors) {
    const from = Math.min(offset, maxLength);
    const to = Math.min(offset + length, maxLength);
    const message = printParseErrorCode(error);
    const key = `${from}:${to}:${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // jsonc parse errors are all syntax errors; severity is required by
    // @codemirror/lint (missing severity silently renders as lowest-priority
    // "hint" styling — a faint grey squiggle instead of a red error one).
    result.push({ from, to, message, severity: 'error' });
  }
  return result;
}

/** CodeMirror lint extension backed by `jsoncDiagnostics`. */
export function jsoncLinter() {
  return linter((view) => {
    const doc = view.state.doc;
    const diags = jsoncDiagnostics(doc.toString(), doc.length);
    return diags as Diagnostic[];
  });
}
