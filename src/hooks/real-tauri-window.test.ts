import { describe, expect, it } from 'vitest';
import { getCurrentWindow } from '@tauri-apps/api/window';

// Real-package test (real-xterm.test.ts tradition): pins the failure mode
// useAlwaysOnTop's try/catch relies on. Outside the Tauri runtime,
// getCurrentWindow() must throw SYNCHRONOUSLY (it dereferences
// window.__TAURI_INTERNALS__.metadata at call time) rather than return a
// rejecting promise — an @tauri-apps/api upgrade changing this would
// silently invalidate the hook's error handling.
describe('real @tauri-apps/api/window outside the Tauri runtime', () => {
  it('getCurrentWindow throws synchronously', () => {
    expect((globalThis as Record<string, unknown>).__TAURI_INTERNALS__).toBeUndefined();
    expect(() => getCurrentWindow()).toThrow();
  });
});
