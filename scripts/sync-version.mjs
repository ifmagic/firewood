import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const pkgPath = resolve(root, 'package.json');
const tauriConfPath = resolve(root, 'src-tauri/tauri.conf.json');
const cargoTomlPath = resolve(root, 'src-tauri/Cargo.toml');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const version = pkg.version;

if (!version) {
  console.error('[sync-version] no version found in package.json');
  process.exit(1);
}

let changed = false;

// Sync tauri.conf.json
const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf-8'));
if (tauriConf.version !== version) {
  const prev = tauriConf.version ?? '(none)';
  tauriConf.version = version;
  writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf-8');
  console.log(`[sync-version] tauri.conf.json: ${prev} -> ${version}`);
  changed = true;
}

// Sync Cargo.toml ([package] section)
const cargoRaw = readFileSync(cargoTomlPath, 'utf-8');
const cargoVersionRe = /^(\[package\][\s\S]*?^version\s*=\s*)"([^"]+)"/m;
const match = cargoRaw.match(cargoVersionRe);
if (!match) {
  console.error('[sync-version] could not find [package] version in Cargo.toml');
  process.exit(1);
}
if (match[2] !== version) {
  const next = cargoRaw.replace(cargoVersionRe, `$1"${version}"`);
  writeFileSync(cargoTomlPath, next, 'utf-8');
  console.log(`[sync-version] Cargo.toml: ${match[2]} -> ${version}`);
  changed = true;
}

if (!changed) {
  console.log(`[sync-version] already in sync at v${version}`);
}
