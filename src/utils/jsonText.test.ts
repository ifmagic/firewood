import { describe, expect, it } from 'vitest';
import { formatJsonText, unescapeJsonText } from './jsonText';

describe('formatJsonText', () => {
  it('formats valid json with 2-space indent', () => {
    expect(formatJsonText('{"a":[1,2],"b":{"c":3}}')).toBe(
      '{\n  "a": [\n    1,\n    2\n  ],\n  "b": {\n    "c": 3\n  }\n}',
    );
  });

  it('keeps formatting stable for already-formatted json', () => {
    const formatted = '{\n  "a": 1\n}';
    expect(formatJsonText(formatted)).toBe(formatted);
  });

  it('falls back to the jsonc formatter for invalid json without throwing', () => {
    const result = formatJsonText('{"a":1,}');
    expect(result).toContain('"a"');
    expect(result).toContain('\n');
  });

  it('formats jsonc with comments via the fallback', () => {
    const result = formatJsonText('{\n  // note\n  "a": 1\n}');
    expect(result).toContain('// note');
    expect(result).toContain('"a": 1');
  });

  it('leaves non-JSON text untouched instead of mangling whitespace', () => {
    // The shared formatter replaced notepad's character-level fallback, which stripped every
    // space outside strings ("hello world" -> "helloworld"). Prose must survive a mis-click.
    expect(formatJsonText('hello world')).toBe('hello world');
    expect(formatJsonText('report 2024 final')).toBe('report 2024 final');
  });

  it('keeps JSONC comments intact in the fallback', () => {
    expect(formatJsonText('{\n  // note\n  "a": 1, // trailing\n}')).toContain('// trailing');
  });

  it('formats each document of an ndjson payload', () => {
    expect(formatJsonText('{"a":1}\n{"b":2}')).toBe('{\n  "a": 1\n}\n{\n  "b": 2\n}');
  });
});

describe('unescapeJsonText', () => {
  it('unwraps a double-stringified json payload', () => {
    expect(unescapeJsonText('"{\\"a\\":1}"')).toBe('{"a":1}');
  });

  it('unescapes bare escaped content from log lines', () => {
    expect(unescapeJsonText('{\\"a\\":\\"b\\",\\"c\\":2}')).toBe('{"a":"b","c":2}');
  });

  it('decodes standard escape sequences', () => {
    expect(unescapeJsonText('"line1\\nline2\\ttab"')).toBe('line1\nline2\ttab');
  });

  it('decodes escaped backslashes in a single pass', () => {
    expect(unescapeJsonText('"a\\\\\\\\b"')).toBe('a\\\\b');
  });

  it('round-trips escaped json into parseable json', () => {
    const escaped = JSON.stringify(JSON.stringify({ a: 1 }));
    expect(JSON.parse(unescapeJsonText(escaped))).toEqual({ a: 1 });
  });

  it('throws for text with unescaped quotes', () => {
    expect(() => unescapeJsonText('she said "hi"')).toThrow();
  });
});
