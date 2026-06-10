import { useEffect, useRef, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { Terminal, type IDisposable } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { usePersistentState } from '../../hooks/usePersistentState';
import ToolLayout from '../../components/ToolLayout';
import './terminal.css';
import '@xterm/xterm/css/xterm.css';

// ── Types ──

interface PtyInfo {
  id: string;
  pid: number;
  cwd: string;
}

interface PtyOutput {
  id: string;
  data: string;
}

// ── Constants ──

const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;
const MAX_BUFFER_CHARS = 100_000;

// 默认字体 fallback：优先 Nerd Font，兜底普通等宽
const DEFAULT_FONT_FAMILY = "'Hack Nerd Font Mono', 'Hack Nerd Font', 'Cascadia Code NF', 'Cascadia Code', Menlo, Consolas, monospace";

const THEME = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#aeafad',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  selectionForeground: '#ffffff',
  black: '#1e1e1e',
  red: '#f44747',
  green: '#6a9955',
  yellow: '#dcdcaa',
  blue: '#569cd6',
  magenta: '#c586c0',
  cyan: '#4ec9b0',
  white: '#d4d4d4',
  brightBlack: '#808080',
  brightRed: '#f44747',
  brightGreen: '#6a9955',
  brightYellow: '#dcdcaa',
  brightBlue: '#569cd6',
  brightMagenta: '#c586c0',
  brightCyan: '#4ec9b0',
  brightWhite: '#ffffff',
};

// ════════════════════════════════════════════════════════════════
//  Module-level persistent state — survives React mount/unmount
// ════════════════════════════════════════════════════════════════

let _term: Terminal | null = null;
let _fit: FitAddon | null = null;
let _div: HTMLDivElement | null = null;
let _fontsReady: Promise<void> | null = null;

let _ptyId: string | null = null;
let _shellPath: string | null = null;

let _onData: IDisposable | null = null;
let _onResize: IDisposable | null = null;

let _ptyListenReady: Promise<UnlistenFn> | null = null;

let _buffer: string[] = [];
let _mounted = false;

// ════════════════════════════════════════════════════════════════
//  Terminal lifecycle
// ════════════════════════════════════════════════════════════════

function ensureFontsReady(fontFamily: string): Promise<void> {
  if (!_fontsReady) {
    _fontsReady = document.fonts.ready.then(() => document.fonts.load(`16px ${fontFamily}`)).then(() => {});
  }
  return _fontsReady;
}

function getTerminal(fontSize: number, fontFamily: string): { term: Terminal; fit: FitAddon } {
  if (_term && _fit) return { term: _term, fit: _fit };

  if (!_div) {
    _div = document.createElement('div');
    _div.style.width = '100%';
    _div.style.height = '100%';
  }

  const term = new Terminal({
    fontFamily,
    fontSize,
    fontWeight: '500',
    fontWeightBold: '700',
    lineHeight: 1.2,
    letterSpacing: 0,
    cursorBlink: true,
    cursorStyle: 'bar',
    cursorWidth: 2,
    theme: THEME,
    scrollback: 10000,
    allowProposedApi: true,
    smoothScrollDuration: 125,
    minimumContrastRatio: 4.5,
    drawBoldTextInBrightColors: true,
  });

  const fit = new FitAddon();
  const unicode11 = new Unicode11Addon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());
  term.loadAddon(unicode11);
  term.unicode.activeVersion = '11';

  term.open(_div);
  fit.fit();

  _term = term;
  _fit = fit;
  return { term, fit };
}

function mountTerminal(container: HTMLElement, fontSize: number, fontFamily: string) {
  const { term, fit } = getTerminal(fontSize, fontFamily);

  if (_div!.parentElement !== container) {
    _div!.style.display = '';
    container.appendChild(_div!);
  }

  _mounted = true;

  if (_buffer.length > 0) {
    term.write(_buffer.join(''));
    _buffer = [];
  }

  detachInput();
  _onData = term.onData((data) => {
    if (_ptyId) invoke('write_pty', { id: _ptyId, data }).catch(console.error);
  });
  _onResize = term.onResize(({ cols, rows }) => {
    if (_ptyId) invoke('resize_pty', { id: _ptyId, rows, cols }).catch(console.error);
  });

  term.options.fontSize = fontSize;
  term.options.fontFamily = fontFamily;
  fit.fit();

  // Auto-focus when switching back to terminal
  setTimeout(() => term.focus(), 50);
}

function unmountTerminal() {
  detachInput();
  _mounted = false;

  if (_div && _div.parentElement) {
    _div.style.display = 'none';
    if (_div.parentElement !== document.body) {
      document.body.appendChild(_div);
    }
  }
}

function detachInput() {
  _onData?.dispose();
  _onData = null;
  _onResize?.dispose();
  _onResize = null;
}

// ════════════════════════════════════════════════════════════════
//  PTY lifecycle
// ════════════════════════════════════════════════════════════════

async function ensurePty(shell?: string): Promise<void> {
  if (_ptyId && (!shell || shell === _shellPath)) return;

  await destroyPty();

  const info: PtyInfo = await invoke('create_pty_session', {
    shell: shell || null,
    cwd: null,
  });

  _ptyId = info.id;
  _shellPath = shell || null;

  await invoke('start_pty_reader', { id: info.id });

  _ptyListenReady = listen<PtyOutput>(`pty:data:${info.id}`, (event) => {
    if (_mounted && _term) {
      _term.write(event.payload.data);
    } else {
      _buffer.push(event.payload.data);
      if (_buffer.length > MAX_BUFFER_CHARS) {
        _buffer = _buffer.slice(-MAX_BUFFER_CHARS / 2);
      }
    }
  });
}

async function destroyPty() {
  if (_ptyListenReady) {
    try {
      const unlisten = await _ptyListenReady;
      unlisten();
    } catch (err) {
      console.error('Failed to remove PTY listener', err);
    }
    _ptyListenReady = null;
  }

  if (_ptyId) {
    try {
      await invoke('close_pty_session', { id: _ptyId });
    } catch (err) {
      console.error('Failed to close PTY session', err);
    }
    _ptyId = null;
    _shellPath = null;
  }

  _buffer = [];
}

async function switchShell(newShell: string | null) {
  await destroyPty();
  _term?.clear();
  await ensurePty(newShell || undefined);
}

// ════════════════════════════════════════════════════════════════
//  React Component
// ════════════════════════════════════════════════════════════════

export default function TerminalPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<ResizeObserver | null>(null);

  // Persisted settings
  const [fontSize, setFontSize] = usePersistentState('firewood-terminal-fontsize', DEFAULT_FONT_SIZE);
  const fontSizeRef = useRef(fontSize);
  useEffect(() => { fontSizeRef.current = fontSize; }, [fontSize]);

  const [fontFamily, setFontFamily] = usePersistentState('firewood-terminal-fontfamily', DEFAULT_FONT_FAMILY);
  const fontFamilyRef = useRef(fontFamily);
  useEffect(() => { fontFamilyRef.current = fontFamily; }, [fontFamily]);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [availableShells, setAvailableShells] = useState<string[]>([]);
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [fontInput, setFontInput] = useState(String(fontSize));
  const [defaultShell, setDefaultShell] = useState('');
  const [selectedShell, setSelectedShell] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);

  const applyFontSize = useCallback((size: number) => {
    const clamped = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size));
    setFontSize(clamped);
    setFontInput(String(clamped));
    if (_term) {
      _term.options.fontSize = clamped;
      _fit?.fit();
    }
  }, [setFontSize]);

  const applyFontFamily = useCallback((family: string) => {
    setFontFamily(family);
    if (_term) {
      _term.options.fontFamily = family;
      _fit?.fit();
    }
  }, [setFontFamily]);

  const handleFontInputCommit = useCallback(() => {
    const parsed = parseInt(fontInput, 10);
    if (!isNaN(parsed)) applyFontSize(parsed);
    else setFontInput(String(fontSizeRef.current));
  }, [fontInput, applyFontSize]);

  // ── Mount / Unmount ──

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    ensureFontsReady(fontFamilyRef.current).then(() => {
      if (cancelled) return;
      mountTerminal(containerRef.current!, fontSizeRef.current, fontFamilyRef.current);
      return ensurePty();
    }).then(() => {
      if (!cancelled) setIsLoading(false);
    }).catch((err) => {
      if (!cancelled) {
        setError(`Failed to connect PTY: ${err}`);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unmountTerminal();
      resizeRef.current?.disconnect();
    };
  }, []);

  // ── Resize observer (runs once) ──

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    resizeRef.current = new ResizeObserver(() => {
      try {
        _fit?.fit();
        if (_ptyId && _term) {
          invoke('resize_pty', { id: _ptyId, rows: _term.rows, cols: _term.cols }).catch(console.error);
        }
      } catch (err) {
        console.error('Failed to resize terminal', err);
      }
    });

    resizeRef.current.observe(container);
    return () => { resizeRef.current?.disconnect(); resizeRef.current = null; };
  }, []);

  // ── Shell list + system fonts (runs once) ──

  useEffect(() => {
    Promise.all([
      invoke<string>('get_default_shell'),
      invoke<string[]>('list_shells'),
      invoke<string[]>('list_system_fonts').catch(() => [] as string[]),
    ]).then(([def, shells, fonts]) => {
      setDefaultShell(def);
      setSelectedShell(_shellPath || def);
      setAvailableShells(shells);
      setSystemFonts(fonts);
    }).catch(console.error);
  }, []);

  // ── Close menu on outside click ──

  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.firewood-terminal-menu-panel')) {
        setShowMenu(false);
      }
    };
    const id = setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', handleClick); };
  }, [showMenu]);

  // ── Cmd+/- font size (runs once) ──

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        applyFontSize(fontSizeRef.current + 1);
      } else if (e.key === '-') {
        e.preventDefault();
        applyFontSize(fontSizeRef.current - 1);
      } else if (e.key === '0') {
        e.preventDefault();
        applyFontSize(DEFAULT_FONT_SIZE);
      }
    };

    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleShellChange = useCallback((value: string) => {
    setSelectedShell(value);
    const shell = value === defaultShell ? null : value;
    setIsLoading(true);
    switchShell(shell).then(() => {
      setIsLoading(false);
    }).catch((err) => {
      setError(`Failed to switch shell: ${err}`);
      setIsLoading(false);
    });
  }, [defaultShell]);

  const handleBrowseShell = useCallback(async () => {
    const dir = selectedShell.split('/').slice(0, -1).join('/') || '/bin';
    const file = await open({
      title: 'Select Shell Executable',
      directory: false,
      multiple: false,
      defaultPath: dir,
    });
    if (file) {
      setSelectedShell(file);
      setIsLoading(true);
      switchShell(file).then(() => setIsLoading(false)).catch((err) => {
        setError(`Failed to switch shell: ${err}`);
        setIsLoading(false);
      });
    }
  }, [selectedShell]);

  const openMenu = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setShowMenu(true);
  }, []);

  // ── Render ──

  return (
    <ToolLayout title="Terminal">
      <div className="firewood-terminal">
        <div className="firewood-terminal-header">
          <div className="firewood-terminal-actions">
            <button
              ref={triggerRef}
              className="firewood-terminal-btn firewood-terminal-menu-trigger"
              onClick={(e) => {
                e.stopPropagation();
                if (showMenu) setShowMenu(false);
                else openMenu();
              }}
              title="Settings"
            >
              ⋮
            </button>
          </div>
        </div>

        {showMenu && (
          <div
            className="firewood-terminal-menu-panel"
            style={{ top: menuPos.top, right: menuPos.right }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="firewood-terminal-menu-section">
              <div className="firewood-terminal-menu-label">Font family</div>
              <div className="firewood-terminal-menu-row">
                <select
                  className="firewood-terminal-menu-select"
                  value={fontFamily}
                  onChange={(e) => applyFontFamily(e.target.value)}
                  style={{ fontFamily: fontFamily, fontSize: 11 }}
                >
                  <option value={DEFAULT_FONT_FAMILY} style={{ fontFamily: DEFAULT_FONT_FAMILY }}>
                    System Default
                  </option>
                  {systemFonts.length > 0 && <option disabled>──────────</option>}
                  {systemFonts.map((f) => (
                    <option key={f} value={`'${f}', monospace`} style={{ fontFamily: `'${f}'` }}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="firewood-terminal-menu-divider" />

            <div className="firewood-terminal-menu-section">
              <div className="firewood-terminal-menu-label">Font size</div>
              <div className="firewood-terminal-menu-row">
                <div className="firewood-terminal-menu-input-group">
                  <button
                    className="firewood-terminal-menu-stepper"
                    onClick={() => applyFontSize(fontSize - 1)}
                    disabled={fontSize <= MIN_FONT_SIZE}
                  >−</button>
                  <input
                    className="firewood-terminal-menu-input"
                    type="text"
                    value={fontInput}
                    onChange={(e) => setFontInput(e.target.value)}
                    onBlur={handleFontInputCommit}
                    onKeyDown={(e) => e.key === 'Enter' && handleFontInputCommit()}
                  />
                  <button
                    className="firewood-terminal-menu-stepper"
                    onClick={() => applyFontSize(fontSize + 1)}
                    disabled={fontSize >= MAX_FONT_SIZE}
                  >+</button>
                  <span className="firewood-terminal-menu-unit">px</span>
                </div>
              </div>
            </div>

            <div className="firewood-terminal-menu-divider" />

            <div className="firewood-terminal-menu-section">
              <div className="firewood-terminal-menu-label">Shell path</div>
              <div className="firewood-terminal-menu-row">
                <select
                  className="firewood-terminal-menu-select"
                  value={selectedShell}
                  onChange={(e) => handleShellChange(e.target.value)}
                >
                  {defaultShell && <option value={defaultShell}>{defaultShell}</option>}
                  {availableShells.filter((s) => s !== defaultShell).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <button
                  className="firewood-terminal-menu-stepper firewood-terminal-menu-browse"
                  onClick={handleBrowseShell}
                  title="Browse for shell executable"
                >📁</button>
              </div>
            </div>
          </div>
        )}

        <div className="firewood-terminal-body">
          {isLoading && (
            <div className="firewood-terminal-overlay">
              <div className="firewood-terminal-spinner" />
              <span>Connecting to shell...</span>
            </div>
          )}
          {error && (
            <div className="firewood-terminal-error-overlay">
              <div className="firewood-terminal-error-icon">!</div>
              <span>{error}</span>
            </div>
          )}
          <div ref={containerRef} className="firewood-terminal-container" />
        </div>

        <div className="firewood-terminal-footer">
          <span className="firewood-terminal-hint">
            ⌘± resize · ⌘0 reset · Ctrl+L clear
          </span>
        </div>
      </div>
    </ToolLayout>
  );
}
