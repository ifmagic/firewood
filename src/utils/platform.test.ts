import { describe, expect, it } from 'vitest';
import { isMacPlatform } from './platform';

// UA table for the single gate deciding which pin surface mounts
// (TitleBar on macOS, sidebar footer elsewhere). The iPadOS desktop-class
// UA is a documented caveat, not an accident: see platform.ts.
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/620.1.15 (KHTML, like Gecko)';
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)';
const IPADOS_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

function stubUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

describe('isMacPlatform', () => {
  it('matches macOS (and the iPadOS desktop-class UA, by design)', () => {
    for (const ua of [MAC_UA, IPADOS_DESKTOP_UA]) {
      stubUserAgent(ua);
      expect(isMacPlatform(), ua.slice(0, 30)).toBe(true);
    }
  });

  it('does not match Windows or Linux', () => {
    for (const ua of [WINDOWS_UA, LINUX_UA]) {
      stubUserAgent(ua);
      expect(isMacPlatform(), ua.slice(0, 30)).toBe(false);
    }
  });
});
