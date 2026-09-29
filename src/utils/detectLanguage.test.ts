import { describe, expect, it } from 'vitest';
import { detectLanguage } from './detectLanguage';

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
