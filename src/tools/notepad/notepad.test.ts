import { describe, expect, it } from 'vitest';
import { bestEffortFormatJson, countCodePoints, detectLanguage, getUrlAtColumn, normalizeUrl } from './helpers';

describe('detectLanguage', () => {
  it('detects json from object and array prefixes', () => {
    expect(detectLanguage('{"a":1}')).toBe('json');
    expect(detectLanguage('  [1, 2]')).toBe('json');
  });

  it('detects html from common tags', () => {
    expect(detectLanguage('<!doctype html>')).toBe('html');
    expect(detectLanguage('<div>hi</div>')).toBe('html');
  });

  it('detects javascript from statement prefixes', () => {
    expect(detectLanguage('const a = 1;')).toBe('javascript');
    expect(detectLanguage('import x from "y";')).toBe('javascript');
    expect(detectLanguage('// comment')).toBe('javascript');
  });

  it('falls back to plaintext', () => {
    expect(detectLanguage('hello world')).toBe('plaintext');
    expect(detectLanguage('')).toBe('plaintext');
  });
});

describe('countCodePoints', () => {
  it('counts BMP chars as 1', () => {
    expect(countCodePoints('abc')).toBe(3);
  });

  it('counts surrogate pairs as 1', () => {
    expect(countCodePoints('a😀b')).toBe(3);
  });

  it('counts CJK chars as 1 each', () => {
    expect(countCodePoints('中文测试')).toBe(4);
  });
});

describe('getUrlAtColumn', () => {
  it('matches a url at a 1-based column inside it', () => {
    const line = 'see https://example.com/x for details';
    expect(getUrlAtColumn(line, 5)).toBe('https://example.com/x');
    expect(getUrlAtColumn(line, 25)).toBe('https://example.com/x');
  });

  it('returns null outside a url', () => {
    const line = 'see https://example.com for details';
    expect(getUrlAtColumn(line, 2)).toBeNull();
    expect(getUrlAtColumn(line, line.length)).toBeNull();
  });

  it('matches www. prefixed urls', () => {
    const line = 'go www.example.com now';
    expect(getUrlAtColumn(line, 5)).toBe('www.example.com');
  });
});

describe('normalizeUrl', () => {
  it('prefixes https to www urls', () => {
    expect(normalizeUrl('www.example.com')).toBe('https://www.example.com');
  });

  it('keeps http urls and strips trailing punctuation', () => {
    expect(normalizeUrl('https://example.com/a).,;')).toBe('https://example.com/a');
  });
});

describe('bestEffortFormatJson', () => {
  it('formats valid json via strict parse', () => {
    expect(bestEffortFormatJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('pretty-prints invalid json without throwing', () => {
    const result = bestEffortFormatJson('{"a":1,}');
    expect(result).toBe('{\n  "a": 1,\n  \n}');
  });

  it('returns input unchanged for empty text', () => {
    expect(bestEffortFormatJson('   ')).toBe('   ');
  });

  it('preserves escaped quotes inside strings', () => {
    const result = bestEffortFormatJson('{"a":"b\\"c"}');
    expect(JSON.parse(result)).toEqual({ a: 'b"c' });
  });
});
