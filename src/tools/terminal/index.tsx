import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { Terminal, type IDisposable } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { usePersistentState } from '../../hooks/usePersistentState';
import ToolLayout from '../../components/ToolLayout';
import './terminal.css';
import '@xterm/xterm/css/xterm.css';

interface PtyInfo {
  id: string;
}

interface PtyOutput {
  id: string;
  data: string;
}

type TerminalTabStatus = 'loading' | 'ready' | 'error';

interface TerminalTabState {
  id: string;
  title: string;
  shellPath: string | null;
  term: Terminal | null;
  fit: FitAddon | null;
  div: HTMLDivElement | null;
  ptyId: string | null;
  onData: IDisposable | null;
  onResize: IDisposable | null;
  ptyListenReady: Promise<UnlistenFn> | null;
  ptyExitListenReady: Promise<UnlistenFn> | null;
  bufferedOutput: string[];
  bufferedChars: number;
  mounted: boolean;
  status: TerminalTabStatus;
  error: string | null;
  disposed: boolean;
  sessionVersion: number;
}

interface TerminalTabView {
  id: string;
  title: string;
  shellPath: string | null;
  status: TerminalTabStatus;
  error: string | null;
}

const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;
const MAX_BUFFER_CHARS = 100_000;
const DEFAULT_FONT_FAMILY =
  "'Hack Nerd Font Mono', 'Hack Nerd Font', 'Cascadia Code NF', 'Cascadia Code', Menlo, Consolas, monospace";

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

let _fontsReady: Promise<void> | null = null;
let _fontsReadyKey = '';
let _terminalTabs: TerminalTabState[] = [];
let _activeTerminalTabId: string | null = null;
let _nextTerminalTabNumber = 1;

function ensureActiveTabSelection() {
  if (_activeTerminalTabId && _terminalTabs.some((tab) => tab.id === _activeTerminalTabId)) {
    return;
  }
  _activeTerminalTabId = _terminalTabs[0]?.id ?? null;
}

function getTabState(id: string | null) {
  return id ? (_terminalTabs.find((tab) => tab.id === id) ?? null) : null;
}

function getTabsSnapshot(): TerminalTabView[] {
  return _terminalTabs.map((tab) => ({
    id: tab.id,
    title: tab.title,
    shellPath: tab.shellPath,
    status: tab.status,
    error: tab.error,
  }));
}

function createTabId() {
  return `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createTerminalHost() {
  const div = document.createElement('div');
  div.style.width = '100%';
  div.style.height = '100%';
  return div;
}

function createTerminalTabState(shellPath: string | null): TerminalTabState {
  return {
    id: createTabId(),
    title: `Terminal ${_nextTerminalTabNumber++}`,
    shellPath,
    term: null,
    fit: null,
    div: null,
    ptyId: null,
    onData: null,
    onResize: null,
    ptyListenReady: null,
    ptyExitListenReady: null,
    bufferedOutput: [],
    bufferedChars: 0,
    mounted: false,
    status: 'loading',
    error: null,
    disposed: false,
    sessionVersion: 0,
  };
}

function getShellDisplayName(shellPath: string | null, defaultShell: string) {
  const target = shellPath || defaultShell;
  if (!target) return 'Shell';
  return target.split(/[\\/]/).pop() || target;
}

function ensureFontsReady(fontFamily: string): Promise<void> {
  if (!_fontsReady || _fontsReadyKey !== fontFamily) {
    _fontsReadyKey = fontFamily;
    _fontsReady = document.fonts.ready.then(() => document.fonts.load(`16px ${fontFamily}`)).then(() => {});
  }
  return _fontsReady;
}

function appendBufferedOutput(tab: TerminalTabState, data: string) {
  if (!data) return;
  tab.bufferedOutput.push(data);
  tab.bufferedChars += data.length;

  while (tab.bufferedChars > MAX_BUFFER_CHARS && tab.bufferedOutput.length > 0) {
    const removed = tab.bufferedOutput.shift() ?? '';
    tab.bufferedChars -= removed.length;
  }
}

function clearBufferedOutput(tab: TerminalTabState) {
  tab.bufferedOutput = [];
  tab.bufferedChars = 0;
}

function detachTabInput(tab: TerminalTabState) {
  tab.onData?.dispose();
  tab.onData = null;
  tab.onResize?.dispose();
  tab.onResize = null;
}

function getOrCreateTerminal(tab: TerminalTabState, fontSize: number, fontFamily: string) {
  if (tab.term && tab.fit) {
    return { term: tab.term, fit: tab.fit };
  }

  if (!tab.div) {
    tab.div = createTerminalHost();
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

  term.open(tab.div);
  fit.fit();

  tab.term = term;
  tab.fit = fit;
  return { term, fit };
}

function fitTerminalTab(tab: TerminalTabState) {
  if (!tab.term || !tab.fit) return;

  tab.fit.fit();
  if (tab.ptyId) {
    invoke('resize_pty', { id: tab.ptyId, rows: tab.term.rows, cols: tab.term.cols }).catch(console.error);
  }
}

function mountTerminalTab(tab: TerminalTabState, container: HTMLElement, fontSize: number, fontFamily: string) {
  const { term } = getOrCreateTerminal(tab, fontSize, fontFamily);

  if (tab.div && tab.div.parentElement !== container) {
    tab.div.style.display = '';
    container.appendChild(tab.div);
  }

  tab.mounted = true;

  if (tab.bufferedOutput.length > 0) {
    term.write(tab.bufferedOutput.join(''));
    clearBufferedOutput(tab);
  }

  detachTabInput(tab);
  tab.onData = term.onData((data) => {
    if (tab.ptyId) {
      invoke('write_pty', { id: tab.ptyId, data }).catch(console.error);
    }
  });
  tab.onResize = term.onResize(() => {
    if (tab.ptyId) {
      invoke('resize_pty', { id: tab.ptyId, rows: term.rows, cols: term.cols }).catch(console.error);
    }
  });

  term.options.fontSize = fontSize;
  term.options.fontFamily = fontFamily;
  fitTerminalTab(tab);

  setTimeout(() => term.focus(), 50);
}

function unmountTerminalTab(tab: TerminalTabState) {
  detachTabInput(tab);
  tab.mounted = false;

  if (tab.div && tab.div.parentElement) {
    tab.div.style.display = 'none';
    if (tab.div.parentElement !== document.body) {
      document.body.appendChild(tab.div);
    }
  }
}

async function destroyTabPty(tab: TerminalTabState) {
  if (tab.ptyListenReady) {
    try {
      const unlisten = await tab.ptyListenReady;
      unlisten();
    } catch (err) {
      console.error('Failed to remove PTY data listener', err);
    }
    tab.ptyListenReady = null;
  }

  if (tab.ptyExitListenReady) {
    try {
      const unlisten = await tab.ptyExitListenReady;
      unlisten();
    } catch (err) {
      console.error('Failed to remove PTY exit listener', err);
    }
    tab.ptyExitListenReady = null;
  }

  const ptyId = tab.ptyId;
  tab.ptyId = null;

  if (ptyId) {
    try {
      await invoke('close_pty_session', { id: ptyId });
    } catch (err) {
      console.error('Failed to close PTY session', err);
    }
  }
}

async function disposeTerminalTab(tab: TerminalTabState) {
  unmountTerminalTab(tab);
  clearBufferedOutput(tab);
  await destroyTabPty(tab);
  tab.term?.dispose();
  tab.term = null;
  tab.fit = null;
  if (tab.div?.parentElement) {
    tab.div.parentElement.removeChild(tab.div);
  }
  tab.div = null;
}

async function startTabSession(tab: TerminalTabState, shellPath: string | null) {
  const sessionVersion = ++tab.sessionVersion;
  tab.status = 'loading';
  tab.error = null;
  tab.shellPath = shellPath;
  clearBufferedOutput(tab);
  tab.term?.clear();

  await destroyTabPty(tab);

  if (tab.disposed || tab.sessionVersion !== sessionVersion) {
    return;
  }

  try {
    const info: PtyInfo = await invoke('create_pty_session', {
      shell: shellPath,
      cwd: null,
    });

    if (tab.disposed || tab.sessionVersion !== sessionVersion) {
      await invoke('close_pty_session', { id: info.id }).catch(console.error);
      return;
    }

    tab.ptyId = info.id;

    await invoke('start_pty_reader', { id: info.id });

    if (tab.disposed || tab.sessionVersion !== sessionVersion) {
      await invoke('close_pty_session', { id: info.id }).catch(console.error);
      tab.ptyId = null;
      return;
    }

    tab.ptyListenReady = listen<PtyOutput>(`pty:data:${info.id}`, (event) => {
      if (tab.disposed || tab.ptyId !== info.id) return;
      if (tab.mounted && tab.term) {
        tab.term.write(event.payload.data);
      } else {
        appendBufferedOutput(tab, event.payload.data);
      }
    });

    const exitMessage = '\r\n[Shell exited]\r\n';
    tab.ptyExitListenReady = listen(`pty:exit:${info.id}`, () => {
      if (tab.disposed || tab.ptyId !== info.id) return;

      tab.ptyId = null;
      void invoke('close_pty_session', { id: info.id }).catch(() => {});

      if (tab.mounted && tab.term) {
        tab.term.write(exitMessage);
      } else {
        appendBufferedOutput(tab, exitMessage);
      }
    });

    tab.status = 'ready';
    tab.error = null;
  } catch (err) {
    await destroyTabPty(tab);
    throw err;
  }
}

function applyTerminalAppearance(fontSize: number, fontFamily: string) {
  _terminalTabs.forEach((tab) => {
    if (!tab.term) return;
    tab.term.options.fontSize = fontSize;
    tab.term.options.fontFamily = fontFamily;
    if (tab.mounted) {
      fitTerminalTab(tab);
    }
  });
}

function buildShellOptions(defaultShell: string, availableShells: string[], currentShell: string) {
  return [...new Set([defaultShell, ...availableShells, currentShell].filter(Boolean))];
}

function toShellOverride(selectedShell: string, defaultShell: string) {
  return selectedShell === defaultShell ? null : selectedShell;
}

export default function TerminalPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<ResizeObserver | null>(null);
  const mountedRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [fontSize, setFontSize] = usePersistentState('firewood-terminal-fontsize', DEFAULT_FONT_SIZE);
  const fontSizeRef = useRef(fontSize);
  useEffect(() => {
    fontSizeRef.current = fontSize;
  }, [fontSize]);

  const [fontFamily, setFontFamily] = usePersistentState('firewood-terminal-fontfamily', DEFAULT_FONT_FAMILY);
  const fontFamilyRef = useRef(fontFamily);
  useEffect(() => {
    fontFamilyRef.current = fontFamily;
  }, [fontFamily]);

  const [tabs, setTabs] = useState<TerminalTabView[]>(() => getTabsSnapshot());
  const [activeTabId, setActiveTabId] = useState(() => _activeTerminalTabId ?? '');
  const [editingTabId, setEditingTabId] = useState('');
  const [tabNameDraft, setTabNameDraft] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [availableShells, setAvailableShells] = useState<string[]>([]);
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [fontInput, setFontInput] = useState(String(fontSize));
  const [defaultShell, setDefaultShell] = useState('');

  const refreshFromStore = useCallback(() => {
    if (!mountedRef.current) return;
    ensureActiveTabSelection();
    setTabs(getTabsSnapshot());
    setActiveTabId(_activeTerminalTabId ?? '');
  }, []);

  const runTabSession = useCallback(
    (tab: TerminalTabState, shellPath: string | null, failurePrefix: string) => {
      tab.status = 'loading';
      tab.error = null;
      refreshFromStore();

      void startTabSession(tab, shellPath)
        .then(() => {
          if (!tab.disposed) {
            refreshFromStore();
          }
        })
        .catch((err) => {
          if (!tab.disposed) {
            tab.status = 'error';
            tab.error = `${failurePrefix}: ${String(err)}`;
          }
          refreshFromStore();
        });
    },
    [refreshFromStore],
  );

  const applyFontSize = useCallback(
    (size: number) => {
      const clamped = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size));
      setFontSize(clamped);
      setFontInput(String(clamped));
    },
    [setFontSize],
  );

  const applyFontFamily = useCallback(
    (family: string) => {
      setFontFamily(family);
    },
    [setFontFamily],
  );

  const handleFontInputCommit = useCallback(() => {
    const parsed = parseInt(fontInput, 10);
    if (!Number.isNaN(parsed)) {
      applyFontSize(parsed);
    } else {
      setFontInput(String(fontSizeRef.current));
    }
  }, [applyFontSize, fontInput]);

  const handleCreateTab = useCallback(
    (shellPath: string | null) => {
      const tab = createTerminalTabState(shellPath);
      _terminalTabs = [..._terminalTabs, tab];
      _activeTerminalTabId = tab.id;
      refreshFromStore();
      runTabSession(tab, shellPath, 'Failed to connect PTY');
    },
    [refreshFromStore, runTabSession],
  );

  const handleActivateTab = useCallback(
    (tabId: string) => {
      if (_activeTerminalTabId === tabId) return;
      _activeTerminalTabId = tabId;
      refreshFromStore();
    },
    [refreshFromStore],
  );

  const handleStartRenameTab = useCallback(
    (tabId: string) => {
      const tab = getTabState(tabId);
      if (!tab) return;

      if (_activeTerminalTabId !== tabId) {
        _activeTerminalTabId = tabId;
        refreshFromStore();
      }

      setEditingTabId(tabId);
      setTabNameDraft(tab.title);
    },
    [refreshFromStore],
  );

  const handleCancelRenameTab = useCallback(() => {
    setEditingTabId('');
    setTabNameDraft('');
  }, []);

  const handleCommitRenameTab = useCallback(() => {
    if (!editingTabId) return;

    const tab = getTabState(editingTabId);
    const nextTitle = tabNameDraft.trim();
    if (tab && nextTitle) {
      tab.title = nextTitle;
      refreshFromStore();
    }

    setEditingTabId('');
    setTabNameDraft('');
  }, [editingTabId, refreshFromStore, tabNameDraft]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const currentIndex = _terminalTabs.findIndex((tab) => tab.id === tabId);
      if (currentIndex < 0) return;

      const tab = _terminalTabs[currentIndex];
      const remainingTabs = _terminalTabs.filter((item) => item.id !== tabId);
      tab.disposed = true;

      if (_activeTerminalTabId === tabId) {
        const fallback = remainingTabs[currentIndex] ?? remainingTabs[currentIndex - 1] ?? null;
        _activeTerminalTabId = fallback?.id ?? null;
      }

      _terminalTabs = remainingTabs;
      if (editingTabId === tabId) {
        setEditingTabId('');
        setTabNameDraft('');
      }
      refreshFromStore();
      void disposeTerminalTab(tab);
    },
    [editingTabId, refreshFromStore],
  );

  const handleRetryActiveTab = useCallback(() => {
    const tab = getTabState(_activeTerminalTabId);
    if (!tab) return;
    runTabSession(tab, tab.shellPath, 'Failed to connect PTY');
  }, [runTabSession]);

  const activeTabMeta = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeTabState = getTabState(activeTabId);
  const currentShell = activeTabState?.shellPath ?? defaultShell;
  const shellOptions = buildShellOptions(defaultShell, availableShells, currentShell);
  const selectedShellValue = currentShell || shellOptions[0] || '';

  const handleShellChange = useCallback(
    (value: string) => {
      const tab = getTabState(_activeTerminalTabId);
      if (!tab) return;

      const shellOverride = toShellOverride(value, defaultShell);
      if (tab.shellPath === shellOverride) return;

      runTabSession(tab, shellOverride, 'Failed to switch shell');
    },
    [defaultShell, runTabSession],
  );

  const handleBrowseShell = async () => {
    const tab = getTabState(_activeTerminalTabId);
    if (!tab) return;

    const baseShell = selectedShellValue || defaultShell || '/bin/zsh';
    const dir = baseShell.split('/').slice(0, -1).join('/') || '/bin';
    const file = await open({
      title: 'Select Shell Executable',
      directory: false,
      multiple: false,
      defaultPath: dir,
    });

    if (typeof file === 'string' && file) {
      runTabSession(tab, toShellOverride(file, defaultShell), 'Failed to switch shell');
    }
  };

  const openMenu = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setShowMenu(true);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (_terminalTabs.length > 0) return;
    const timerId = setTimeout(() => handleCreateTab(null), 0);
    return () => clearTimeout(timerId);
  }, [handleCreateTab]);

  useEffect(() => {
    if (!editingTabId) return;

    const frameId = requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });

    return () => cancelAnimationFrame(frameId);
  }, [editingTabId]);

  useEffect(() => {
    Promise.all([
      invoke<string>('get_default_shell'),
      invoke<string[]>('list_shells'),
      invoke<string[]>('list_system_fonts').catch(() => [] as string[]),
    ])
      .then(([detectedDefaultShell, shells, fonts]) => {
        setDefaultShell(detectedDefaultShell);
        setAvailableShells(shells);
        setSystemFonts(fonts);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('.firewood-terminal-menu-panel')) {
        setShowMenu(false);
      }
    };
    const timerId = setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => {
      clearTimeout(timerId);
      document.removeEventListener('click', handleClick);
    };
  }, [showMenu]);

  useEffect(() => {
    const container = containerRef.current;
    const tab = getTabState(activeTabId);
    if (!container || !tab) return;

    let cancelled = false;

    void ensureFontsReady(fontFamilyRef.current)
      .then(() => {
        if (cancelled || tab.disposed) return;
        mountTerminalTab(tab, container, fontSizeRef.current, fontFamilyRef.current);
      })
      .catch((err) => {
        if (cancelled || tab.disposed) return;
        tab.status = 'error';
        tab.error = `Failed to render terminal: ${String(err)}`;
        refreshFromStore();
      });

    return () => {
      cancelled = true;
      unmountTerminalTab(tab);
    };
  }, [activeTabId, refreshFromStore]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    resizeRef.current = new ResizeObserver(() => {
      const tab = getTabState(_activeTerminalTabId);
      if (!tab) return;

      try {
        fitTerminalTab(tab);
      } catch (err) {
        console.error('Failed to resize terminal', err);
      }
    });

    resizeRef.current.observe(container);
    return () => {
      resizeRef.current?.disconnect();
      resizeRef.current = null;
    };
  }, []);

  useEffect(() => {
    void ensureFontsReady(fontFamily)
      .then(() => {
        applyTerminalAppearance(fontSize, fontFamily);
      })
      .catch(console.error);
  }, [fontFamily, fontSize]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        applyFontSize(fontSizeRef.current + 1);
      } else if (event.key === '-') {
        event.preventDefault();
        applyFontSize(fontSizeRef.current - 1);
      } else if (event.key === '0') {
        event.preventDefault();
        applyFontSize(DEFAULT_FONT_SIZE);
      } else if (event.key === 'l' || event.key === 'L') {
        event.preventDefault();
        const tab = getTabState(_activeTerminalTabId);
        tab?.term?.clear();
      }
    };

    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [applyFontSize]);

  return (
    <ToolLayout title="Terminal">
      <div className="firewood-terminal">
        <div className="firewood-terminal-header">
          <div className="firewood-terminal-tabStrip">
            <div className="firewood-terminal-tabs" role="tablist" aria-label="Terminal tabs">
              {tabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                const isEditing = editingTabId === tab.id;
                const shellLabel = getShellDisplayName(tab.shellPath, defaultShell);

                return (
                  <div
                    key={tab.id}
                    className={`firewood-terminal-tab${isActive ? ' is-active' : ''}`}
                    title={
                      isActive
                        ? `${tab.title} · ${shellLabel} · Double-click to rename`
                        : `${tab.title} · ${shellLabel}`
                    }
                  >
                    {isEditing ? (
                      <div className="firewood-terminal-tabEditor">
                        <span className={`firewood-terminal-tabStatus firewood-terminal-tabStatus-${tab.status}`} />
                        <input
                          ref={renameInputRef}
                          className="firewood-terminal-tabRenameInput"
                          value={tabNameDraft}
                          onChange={(event) => setTabNameDraft(event.target.value)}
                          onBlur={handleCommitRenameTab}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleCommitRenameTab();
                            } else if (event.key === 'Escape') {
                              event.preventDefault();
                              handleCancelRenameTab();
                            }
                          }}
                          aria-label={`Rename ${tab.title}`}
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="firewood-terminal-tabButton"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => handleActivateTab(tab.id)}
                        onDoubleClick={() => {
                          if (isActive) {
                            handleStartRenameTab(tab.id);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'F2' && isActive) {
                            event.preventDefault();
                            handleStartRenameTab(tab.id);
                          }
                        }}
                      >
                        <span className={`firewood-terminal-tabStatus firewood-terminal-tabStatus-${tab.status}`} />
                        <span className="firewood-terminal-tabTitle">{tab.title}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="firewood-terminal-tabClose"
                      title={`Close ${tab.title}`}
                      aria-label={`Close ${tab.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleCloseTab(tab.id);
                      }}
                    >
                      <CloseOutlined />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="firewood-terminal-btn firewood-terminal-addTab"
              onClick={() => handleCreateTab(activeTabState?.shellPath ?? null)}
              title="New Terminal"
              aria-label="New Terminal"
            >
              <PlusOutlined />
            </button>
          </div>

          <div className="firewood-terminal-actions">
            <button
              type="button"
              ref={triggerRef}
              className="firewood-terminal-btn firewood-terminal-menu-trigger"
              onClick={(event) => {
                event.stopPropagation();
                if (showMenu) setShowMenu(false);
                else openMenu();
              }}
              title="Settings"
              aria-label="Settings"
            >
              ⋮
            </button>
          </div>
        </div>

        {showMenu && (
          <div
            className="firewood-terminal-menu-panel"
            style={{ top: menuPos.top, right: menuPos.right }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="firewood-terminal-menu-section">
              <div className="firewood-terminal-menu-label">Font family</div>
              <div className="firewood-terminal-menu-row">
                <select
                  className="firewood-terminal-menu-select"
                  value={fontFamily}
                  onChange={(event) => applyFontFamily(event.target.value)}
                  style={{ fontFamily, fontSize: 11 }}
                >
                  <option value={DEFAULT_FONT_FAMILY} style={{ fontFamily: DEFAULT_FONT_FAMILY }}>
                    System Default
                  </option>
                  {systemFonts.length > 0 && <option disabled>──────────</option>}
                  {systemFonts.map((family) => (
                    <option key={family} value={`'${family}', monospace`} style={{ fontFamily: `'${family}'` }}>
                      {family}
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
                    type="button"
                    className="firewood-terminal-menu-stepper"
                    onClick={() => applyFontSize(fontSize - 1)}
                    disabled={fontSize <= MIN_FONT_SIZE}
                  >
                    −
                  </button>
                  <input
                    className="firewood-terminal-menu-input"
                    type="text"
                    value={fontInput}
                    onChange={(event) => setFontInput(event.target.value)}
                    onBlur={handleFontInputCommit}
                    onKeyDown={(event) => event.key === 'Enter' && handleFontInputCommit()}
                  />
                  <button
                    type="button"
                    className="firewood-terminal-menu-stepper"
                    onClick={() => applyFontSize(fontSize + 1)}
                    disabled={fontSize >= MAX_FONT_SIZE}
                  >
                    +
                  </button>
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
                  value={selectedShellValue}
                  onChange={(event) => handleShellChange(event.target.value)}
                  disabled={!activeTabState || shellOptions.length === 0}
                >
                  {shellOptions.map((shell) => (
                    <option key={shell} value={shell}>
                      {shell}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="firewood-terminal-menu-stepper firewood-terminal-menu-browse"
                  onClick={() => {
                    void handleBrowseShell();
                  }}
                  title="Browse for shell executable"
                  disabled={!activeTabState}
                >
                  📁
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="firewood-terminal-body">
          {tabs.length === 0 && (
            <div className="firewood-terminal-emptyState">
              <div className="firewood-terminal-emptyTitle">No terminals open</div>
              <button type="button" className="firewood-terminal-emptyAction" onClick={() => handleCreateTab(null)}>
                Create Terminal
              </button>
            </div>
          )}

          {activeTabMeta?.status === 'loading' && (
            <div className="firewood-terminal-overlay">
              <div className="firewood-terminal-spinner" />
              <span>Connecting to shell...</span>
            </div>
          )}

          {activeTabMeta?.error && activeTabMeta.status !== 'loading' && (
            <div className="firewood-terminal-error-overlay">
              <div className="firewood-terminal-error-icon">!</div>
              <span>{activeTabMeta.error}</span>
              <button type="button" className="firewood-terminal-retry-btn" onClick={handleRetryActiveTab}>
                Retry
              </button>
            </div>
          )}

          <div ref={containerRef} className="firewood-terminal-container" />
        </div>

        <div className="firewood-terminal-footer">
          <span className="firewood-terminal-hint">⌘± resize · ⌘0 reset · Ctrl+L clear</span>
        </div>
      </div>
    </ToolLayout>
  );
}
