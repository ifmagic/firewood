import { useEffect, useRef, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import ToolLayout from '../../components/ToolLayout';
import './terminal.css';
import '@xterm/xterm/css/xterm.css';

interface PtyInfo {
  id: string;
  pid: number;
  cwd: string;
}

interface PtyOutput {
  id: string;
  data: string;
}

export default function TerminalPage() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [cwd, setCwd] = useState('~');
  const [shell, setShell] = useState('Terminal');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initTerminal = useCallback(async () => {
    if (!terminalRef.current || terminalInstance.current) return;

    try {
      const term = new Terminal({
        fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
        fontSize: 14,
        lineHeight: 1.2,
        cursorBlink: true,
        cursorStyle: 'bar',
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#ffffff',
          cursorAccent: '#1e1e1e',
          selectionBackground: '#264f78',
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
        },
        scrollback: 10000,
        allowProposedApi: true,
      });

      const fit = new FitAddon();
      const webLinks = new WebLinksAddon();

      term.loadAddon(fit);
      term.loadAddon(webLinks);

      term.open(terminalRef.current);
      fit.fit();

      terminalInstance.current = term;
      fitAddon.current = fit;

      setIsConnected(true);
    } catch (err) {
      console.error('Failed to initialize terminal:', err);
      setError(`Failed to initialize terminal: ${err}`);
    }
  }, []);

  const connectPty = useCallback(async () => {
    if (!terminalInstance.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const ptyInfo: PtyInfo = await invoke('create_pty_session', {
        shell: null,
        cwd: null,
      });

      ptyIdRef.current = ptyInfo.id;
      setCwd(ptyInfo.cwd);

      const defaultShell = await invoke<string>('get_default_shell');
      setShell(defaultShell.split('/').pop() || 'Terminal');

      const term = terminalInstance.current;

      term.onData((data) => {
        if (ptyIdRef.current) {
          invoke('write_pty', { id: ptyIdRef.current, data }).catch((err) => {
            console.error('Write error:', err);
          });
        }
      });

      term.onResize(({ cols, rows }) => {
        if (ptyIdRef.current) {
          invoke('resize_pty', { id: ptyIdRef.current, rows, cols }).catch((err) => {
            console.error('Resize error:', err);
          });
        }
      });

      const unlisten = await listen<PtyOutput>(`pty:data:${ptyInfo.id}`, (event) => {
        term.write(event.payload.data);
      });

      unlistenRef.current = unlisten;

      await invoke('start_pty_reader', { id: ptyInfo.id });

      setIsLoading(false);
    } catch (err) {
      console.error('Failed to connect PTY:', err);
      setError(`Failed to connect PTY: ${err}`);
      setIsLoading(false);
    }
  }, []);

  const disconnectPty = useCallback(async () => {
    if (ptyIdRef.current) {
      try {
        await invoke('close_pty_session', { id: ptyIdRef.current });
      } catch (err) {
        console.error('Error closing PTY session:', err);
      }
      ptyIdRef.current = null;
    }

    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }

    setIsConnected(false);
  }, []);

  const reconnectPty = useCallback(async () => {
    await disconnectPty();
    if (terminalInstance.current) {
      terminalInstance.current.clear();
      terminalInstance.current.write('\x1b[1;1H\x1b[2J');
    }
    await connectPty();
  }, [connectPty, disconnectPty]);

  useEffect(() => {
    initTerminal().then(() => {
      connectPty();
    });

    return () => {
      disconnectPty();
      if (terminalInstance.current) {
        terminalInstance.current.dispose();
        terminalInstance.current = null;
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, [initTerminal, connectPty, disconnectPty]);

  useEffect(() => {
    if (terminalRef.current && fitAddon.current) {
      resizeObserverRef.current = new ResizeObserver(() => {
        try {
          fitAddon.current?.fit();
          if (ptyIdRef.current && terminalInstance.current) {
            const { cols, rows } = terminalInstance.current;
            invoke('resize_pty', { id: ptyIdRef.current, rows, cols }).catch(console.error);
          }
        } catch (e) {
          console.error('Fit error:', e);
        }
      });

      resizeObserverRef.current.observe(terminalRef.current);
    }

    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, [isConnected]);

  const handleClear = useCallback(() => {
    if (terminalInstance.current) {
      terminalInstance.current.clear();
      terminalInstance.current.write('\x1b[1;1H\x1b[2J');
    }
  }, []);

  return (
    <ToolLayout title="Terminal" description="Integrated terminal with PTY support">
      <div className="firewood-terminal">
        <div className="firewood-terminal-header">
          <div className="firewood-terminal-info">
            <span className="firewood-terminal-shell-name">{shell}</span>
            <span className="firewood-terminal-cwd">{cwd}</span>
          </div>
          <div className="firewood-terminal-actions">
            <button
              className="firewood-terminal-btn"
              onClick={reconnectPty}
              title="Reconnect"
            >
              ↻
            </button>
            <button
              className="firewood-terminal-btn"
              onClick={handleClear}
              title="Clear"
            >
              ✕
            </button>
          </div>
        </div>

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
              <button onClick={reconnectPty} className="firewood-terminal-retry-btn">
                Retry
              </button>
            </div>
          )}

          <div ref={terminalRef} className="firewood-terminal-container" />
        </div>

        <div className="firewood-terminal-footer">
          <span className={`firewood-terminal-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '● Connected' : '○ Disconnected'}
          </span>
          <span className="firewood-terminal-hint">
            Tip: Use Ctrl+Click to open links, scroll to navigate history
          </span>
        </div>
      </div>
    </ToolLayout>
  );
}
