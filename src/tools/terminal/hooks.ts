import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { homeDir } from '@tauri-apps/api/path';
import { Command, type Child } from '@tauri-apps/plugin-shell';
import {
  TERMINAL_SHELLS,
  getTerminalPlatform,
  getTerminalShellDefinition,
  getShellsForPlatform,
  getDefaultShellForPlatform,
  formatShellError,
} from './settings';
import type {
  TerminalOutputEntry,
  TerminalOutputKind,
  TerminalPlatform,
  TerminalSession,
  TerminalShellAvailability,
  TerminalShellId,
} from './types';

function createEntryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSessionId() {
  return `terminal-session-${createEntryId()}`;
}

function buildOutputEntry(kind: TerminalOutputKind, text: string): TerminalOutputEntry {
  return { id: createEntryId(), kind, text };
}

function createSession(shellId: TerminalShellId, cwd: string): TerminalSession {
  return {
    id: createSessionId(),
    title: 'Terminal',
    shellId,
    cwd,
    input: '',
    history: [],
    historyIndex: null,
    output: [],
    running: false,
    lastExitCode: null,
  };
}

async function detectShellAvailability(shell: typeof TERMINAL_SHELLS[0]): Promise<TerminalShellAvailability> {
  try {
    const args = shell.detectArgs === true ? ['--version'] : (shell.detectArgs as string[]);
    await Command.create(shell.sidecar, args).execute();
    return { id: shell.id, label: shell.label, available: true, command: shell.sidecar };
  } catch {
    try {
      const args = shell.detectArgs === true ? ['--version'] : (shell.detectArgs as string[]);
      await Command.create(shell.fallbackCommand, args).execute();
      return { id: shell.id, label: shell.label, available: true, command: shell.fallbackCommand };
    } catch {
      return { id: shell.id, label: shell.label, available: false, command: shell.sidecar };
    }
  }
}

export function useTerminal() {
  const platform = useMemo<TerminalPlatform>(() => getTerminalPlatform(), []);
  const platformShells = useMemo(() => getShellsForPlatform(platform), [platform]);
  const defaultShellId = useMemo(() => getDefaultShellForPlatform(platform), [platform]);
  
  const [availableShells, setAvailableShells] = useState<TerminalShellAvailability[]>([]);
  const [detecting, setDetecting] = useState(true);
  const [session, setSession] = useState<TerminalSession>(() => createSession(defaultShellId, '~'));
  
  const childRef = useRef<Child | null>(null);

  const availableShellIds = useMemo(() => availableShells.filter(s => s.available).map(s => s.id), [availableShells]);
  const currentShell = useMemo(() => availableShells.find(s => s.id === session.shellId), [availableShells, session.shellId]);
  const shellDefinition = useMemo(() => getTerminalShellDefinition(session.shellId), [session.shellId]);

  const appendOutput = useCallback((kind: TerminalOutputKind, text: string) => {
    if (!text) return;
    setSession(prev => ({
      ...prev,
      output: [...prev.output, buildOutputEntry(kind, text)],
    }));
  }, []);

  const interruptShell = useCallback(async () => {
    if (childRef.current) {
      try {
        await childRef.current.kill();
      } catch {
        childRef.current = null;
      }
    }
  }, []);

  const startShell = useCallback(async () => {
    if (!currentShell?.available || !shellDefinition) return;
    if (childRef.current) return;

    try {
      const command = Command.create(shellDefinition.sidecar, ['-i']);

      command.stdout.on('data', (data: string) => {
        appendOutput('stdout', data);
      });

      command.stderr.on('data', (data: string) => {
        appendOutput('stderr', data);
      });

      command.on('close', ({ code, signal }) => {
        childRef.current = null;
        if (code !== null) {
          appendOutput('system', `\n[Process exited with code ${code}]\n`);
        } else if (signal !== null) {
          appendOutput('system', `\n[Process killed with signal ${signal}]\n`);
        }
        setSession(prev => ({ ...prev, running: false }));
      });

      command.on('error', (error: string) => {
        appendOutput('system', `Error: ${error}\n`);
        childRef.current = null;
        setSession(prev => ({ ...prev, running: false }));
      });

      const child = await command.spawn();
      childRef.current = child;
      setSession(prev => ({ ...prev, running: true }));
    } catch (error) {
      appendOutput('system', `Failed to start shell: ${formatShellError(error)}\n`);
    }
  }, [currentShell, shellDefinition, appendOutput]);

  const sendCommand = useCallback(async (commandText: string) => {
    if (!childRef.current || !commandText.trim()) return;

    try {
      appendOutput('command', `${commandText}\n`);
      await childRef.current.write(`${commandText}\n`);

      setSession(prev => ({
        ...prev,
        input: '',
        history: prev.history.includes(commandText) ? prev.history : [...prev.history, commandText],
      }));
    } catch (error) {
      appendOutput('system', `Failed to send command: ${formatShellError(error)}\n`);
    }
  }, [appendOutput]);

  useEffect(() => {
    let cancelled = false;
    
    const init = async () => {
      try {
        const home = await homeDir().catch(() => '~');
        
        const shells = await Promise.all(platformShells.map(detectShellAvailability));
        if (!cancelled) {
          setAvailableShells(shells);
          
          const availableIds = shells.filter(s => s.available).map(s => s.id);
          const firstAvailable = availableIds[0] ?? defaultShellId;
          
          setSession(prev => ({ ...prev, cwd: home, shellId: firstAvailable }));
          
          setTimeout(() => {
            if (!cancelled) {
              void startShell();
            }
          }, 100);
        }
      } catch (error) {
        console.error('Terminal init error:', error);
      } finally {
        setDetecting(false);
      }
    };
    
    void init();
    return () => {
      cancelled = true;
      void interruptShell();
    };
  }, [startShell, interruptShell]);

  const navigateHistory = useCallback((direction: 'up' | 'down') => {
    setSession(prev => {
      if (!prev.history.length) return prev;
      
      const baseIndex = prev.historyIndex ?? prev.history.length;
      const nextIndex = direction === 'up'
        ? Math.max(0, baseIndex - 1)
        : Math.min(prev.history.length, baseIndex + 1);

      if (nextIndex === prev.history.length) {
        return { ...prev, historyIndex: null, input: '' };
      }

      return { ...prev, historyIndex: nextIndex, input: prev.history[nextIndex] ?? '' };
    });
  }, []);

  const clearOutput = useCallback(() => {
    setSession(prev => ({ ...prev, output: [] }));
  }, []);

  const changeShell = useCallback((shellId: TerminalShellId) => {
    const shell = availableShells.find(s => s.id === shellId);
    if (shell?.available) {
      void interruptShell();
      setSession(prev => ({ ...prev, shellId, output: [], input: '', history: [] }));
      setTimeout(() => {
        void startShell();
      }, 100);
    }
  }, [availableShells, interruptShell, startShell]);

  const selectHistoryCommand = useCallback((command: string) => {
    setSession(prev => ({ ...prev, input: command, historyIndex: null }));
  }, []);

  const historyList = useMemo(() => {
    return [...session.history].reverse();
  }, [session.history]);

  return {
    session,
    platform,
    availableShells,
    availableShellIds,
    detecting,
    currentShell,
    setInput: (input: string) => setSession(prev => ({ ...prev, input })),
    sendCommand,
    navigateHistory,
    clearOutput,
    changeShell,
    interruptShell,
    historyList,
    selectHistoryCommand,
  };
}
