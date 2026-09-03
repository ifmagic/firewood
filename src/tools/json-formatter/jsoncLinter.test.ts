import { describe, expect, it } from 'vitest';
import { jsoncDiagnostics } from './jsoncLinter';

describe('jsoncDiagnostics (lint matches jsonc-parser format tolerance)', () => {
  it('valid JSON has no diagnostics', () => {
    expect(jsoncDiagnostics('{"a": 1, "b": [1, 2]}')).toEqual([]);
  });

  it('blank content has no diagnostics (empty tool state must not show errors)', () => {
    expect(jsoncDiagnostics('')).toEqual([]);
    expect(jsoncDiagnostics('   \n\n')).toEqual([]);
  });

  it('JSONC comments are tolerated', () => {
    const text = ['// header comment', '{', '  /* block */ "a": 1, // trailing comment', '  "b": 2', '}'].join('\n');
    expect(jsoncDiagnostics(text)).toEqual([]);
  });

  it('trailing commas are tolerated (jsonc-format fallback accepts them)', () => {
    expect(jsoncDiagnostics('{"a": 1,}')).toEqual([]);
    expect(jsoncDiagnostics('{"a": [1, 2,],}')).toEqual([]);
  });

  it('unquoted keys are reported', () => {
    const diags = jsoncDiagnostics('{a: 1}');
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0].from).toBe(1);
    expect(diags[0].message).toBeTruthy();
  });
  it('pasted log line before a JSON object is reported at the prefix', () => {
    const text = 'queryRecommendSolutionList end: {\n  "a": 1\n}';
    const diags = jsoncDiagnostics(text);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0].from).toBe(0);
    // the first diagnostic covers the invalid log-word prefix
    expect(diags[0].to).toBeGreaterThan(0);
  });

  it('missing brace is reported', () => {
    const diags = jsoncDiagnostics('{"a": 1');
    expect(diags.length).toBeGreaterThan(0);
  });

  it('positions are clamped to maxLength', () => {
    const diags = jsoncDiagnostics('{a: 1}', 2);
    for (const d of diags) {
      expect(d.from).toBeLessThanOrEqual(2);
      expect(d.to).toBeLessThanOrEqual(2);
    }
  });

  it('duplicate errors at the same range are deduped', () => {
    const diags = jsoncDiagnostics('{a: 1}');
    const keys = diags.map((d) => `${d.from}:${d.to}:${d.message}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('diagnostics carry error severity (missing severity renders as faint hint style)', () => {
    const diags = jsoncDiagnostics('{"a": 1');
    expect(diags.length).toBeGreaterThan(0);
    for (const d of diags) {
      expect(d.severity).toBe('error');
    }
  });
});
