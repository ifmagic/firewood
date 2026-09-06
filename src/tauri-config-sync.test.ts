import { describe, expect, it } from 'vitest';

// Tauri merges window configs via RFC 7386 JSON merge patch (arrays are
// replaced whole), so tauri.macos.conf.json and tauri.dev.conf.json must
// each duplicate the FULL window object. Prose in AGENTS.md cannot enforce
// that — this test is the executable guard (the drift class already shipped
// one bug: dev silently losing titleBarStyle "Overlay").
// See AGENTS.md → Window Titlebar & Always-on-Top Pin.
//
// import.meta.glob (not a direct import) because the JSON files live in
// src-tauri/, outside this tsconfig's include root; vite/vitest handles the
// load and vite/client types the glob. Glob patterns must be root-relative
// (leading "/") — "../.." traversal is not supported.
interface TauriConf {
  app: { windows: Array<Record<string, unknown>> };
}

const configs = import.meta.glob<TauriConf>(
  ['/src-tauri/tauri.conf.json', '/src-tauri/tauri.macos.conf.json', '/src-tauri/tauri.dev.conf.json'],
  {
    eager: true,
    import: 'default',
  },
);

const readWindowConfig = (file: string): Record<string, unknown> => {
  const conf = configs[`/src-tauri/${file}`];
  expect(conf, `${file} not found by glob`).toBeTruthy();
  expect(conf!.app.windows, `${file} app.windows`).toHaveLength(1);
  return conf!.app.windows[0];
};

describe('tauri window config sync (base / macos / dev)', () => {
  const base = readWindowConfig('tauri.conf.json');
  const macos = readWindowConfig('tauri.macos.conf.json');
  const dev = readWindowConfig('tauri.dev.conf.json');

  it('macos window config is base + titleBarStyle (no other drift)', () => {
    const { titleBarStyle, ...macosRest } = macos;
    expect(macosRest).toEqual(base);
    expect(titleBarStyle).toBe('Overlay');
  });

  it('dev window config is the macos config except the dev-only title', () => {
    const { title: devTitle, ...devRest } = dev;
    const { title: macosTitle, ...macosRest } = macos;
    expect(devRest).toEqual(macosRest);
    expect(devTitle).toBe('Firewood Dev');
    expect(macosTitle).toBe('Firewood');
  });
});
