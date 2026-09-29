import { describe, expect, it } from 'vitest';
import { countCodePoints, getUrlAtColumn, normalizeUrl } from './helpers';

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
