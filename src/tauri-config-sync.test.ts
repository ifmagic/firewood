import { describe, expect, it } from 'vitest';

// Tauri merges window configs via RFC 7386 JSON merge patch (arrays are
// replaced whole), so every config that carries an app.windows array must
// duplicate the FULL window object — and tauri.dev.conf.json must carry NO
// array at all, or the --config merge (applied last, over base + platform)
// would replace the platform window config and silently drop the chrome:
// macOS' titleBarStyle "Overlay" and Windows' undecorated mode. That drift
// class already shipped one bug (dev losing Overlay). Prose in AGENTS.md
// cannot enforce it — this test is the executable guard. The dev window title
// is set from Rust (`#[cfg(debug_assertions)] set_title`) for the same reason.
// See AGENTS.md → Window Titlebar & Always-on-Top Pin.
//
// import.meta.glob (not a direct import) because the JSON files live in
// src-tauri/, outside this tsconfig's include root; vite/vitest handles the
// load and vite/client types the glob. Glob patterns must be root-relative
// (leading "/") — "../.." traversal is not supported.
interface TauriConf {
  app?: { windows?: Array<Record<string, unknown>> };
  productName?: string;
  identifier?: string;
}

const configs = import.meta.glob<TauriConf>(
  [
    '/src-tauri/tauri.conf.json',
    '/src-tauri/tauri.macos.conf.json',
    '/src-tauri/tauri.windows.conf.json',
    '/src-tauri/tauri.dev.conf.json',
  ],
  {
    eager: true,
    import: 'default',
  },
);

const readConf = (file: string): TauriConf => {
  const conf = configs[`/src-tauri/${file}`];
  expect(conf, `${file} not found by glob`).toBeTruthy();
  return conf!;
};

const readWindowConfig = (file: string): Record<string, unknown> => {
  const conf = readConf(file);
  expect(conf.app?.windows, `${file} app.windows`).toHaveLength(1);
  return conf.app!.windows![0];
};

describe('tauri window config sync (base / macos / windows / dev)', () => {
  const base = readWindowConfig('tauri.conf.json');

  it('macos window config is base + titleBarStyle (no other drift)', () => {
    const { titleBarStyle, ...macosRest } = readWindowConfig('tauri.macos.conf.json');
    expect(macosRest).toEqual(base);
    expect(titleBarStyle).toBe('Overlay');
  });

  it('windows window config is base + undecorated chrome (no other drift)', () => {
    const { decorations, shadow, ...windowsRest } = readWindowConfig('tauri.windows.conf.json');
    expect(windowsRest).toEqual(base);
    expect(decorations).toBe(false);
    // shadow must stay true: only then does tao keep the DWM frame on an
    // undecorated window, which supplies the drop shadow, the Windows 11
    // rounded corners and the native resize borders.
    expect(shadow).toBe(true);
  });

  it('dev config carries no window array (platform configs must survive the merge)', () => {
    const dev = readConf('tauri.dev.conf.json');
    expect(dev.app?.windows, 'dev app.windows must be absent').toBeUndefined();
    expect(dev.productName).toBe('Firewood Dev');
    expect(dev.identifier).toBe('com.ifmagic.firewood.dev');
  });
});
