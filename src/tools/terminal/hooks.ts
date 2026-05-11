import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { homeDir } from '@tauri-apps/api/path';
import { Child, Command } from '@tauri-apps/plugin-shell';
import { usePersistentState } from '../../hooks/usePersistentState';
import {
  TERMINAL_DEFAULT_SHELL_STORAGE_KEY,
  TERMINAL_SHELL_MARKER_PREFIX,
  TERMINAL_SHELLS,
  createShellMarker,
  createTerminalSessionTitle,
  formatShellError,
  getTerminalPlatform,
  getTerminalShellDefinition,
  getTerminalShellOrder,
  resolvePreferredShell,
} from './settings';
import type {
  TerminalOutputEntry,
  TerminalOutputKind,
  TerminalPlatform,
  TerminalSession,
  TerminalShellAvailability,
  TerminalShellId,
} from './types';

interface SessionRuntime {
  child: Child | null;
  marker: string | null;
  stdoutCarry: string;
  interrupted: boolean;
}

function createEntryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSessionId() {
  return `terminal-session-${createEntryId()}`;
}

function buildOutputEntry(kind: TerminalOutputKind, text: string): TerminalOutputEntry {
  return {
    id: createEntryId(),
    kind,
    text,
  };
}

function appendOutputEntry(entries: TerminalOutputEntry[], kind: TerminalOutputKind, text: string) {
  if (!text) {
    return entries;
  }

  const lastEntry = entries.at(-1);
  if (lastEntry && lastEntry.kind === kind && (kind === 'stdout' || kind === 'stderr')) {
    return [
      ...entries.slice(0, -1),
      {
        ...lastEntry,
        text: `${lastEntry.text}${text}`,
      },
    ];
  }

  return [...entries, buildOutputEntry(kind, text)];
}

function createSessionState(shellId: TerminalShellId, cwd: string, index: number): TerminalSession {
  return {
    id: createSessionId(),
    title: createTerminalSessionTitle(index),
    shellId,
    cwd,
    input: '',
    draftInput: '',
    history: [],
    historyIndex: null,
    output: [],
    running: false,
    lastExitCode: null,
  };
}

function getFriendlyMissingShellMessage(label: string) {
  return `${label} is not available on this system.`;
}

async function detectTerminalShell(shell: (typeof TERMINAL_SHELLS)[number]) {
  let lastError = 'The shell could not be started.';

  for (const candidate of shell.commandCandidates) {
    try {
      await Command.create(candidate.name, shell.detectArgs).execute();
      return {
        id: shell.id,
        label: shell.label,
        available: true,
        commandName: candidate.name,
        commandPath: candidate.cmd,
      } satisfies TerminalShellAvailability;
    } catch (error) {
      lastError = formatShellError(error);
    }
  }

  return {
    id: shell.id,
    label: shell.label,
    available: false,
    error: lastError,
  } satisfies TerminalShellAvailability;
}

export function useTerminalSessions() {
  const platform = useMemo<TerminalPlatform>(() => getTerminalPlatform(), []);
  const initialShellId = useMemo<TerminalShellId>(() => getTerminalShellOrder(platform)[0], [platform]);
  const [defaultShellId, setDefaultShellId] = usePersistentState<TerminalShellId | null>(TERMINAL_DEFAULT_SHELL_STORAGE_KEY, null);
  const initialSession = useMemo(() => createSessionState(defaultShellId ?? initialShellId, '~', 1), [defaultShellId, initialShellId]);
  const [sessions, setSessions] = useState<TerminalSession[]>(() => [initialSession]);
  const [activeSessionId, setActiveSessionId] = useState(initialSession.id);
  const [availableShells, setAvailableShells] = useState<TerminalShellAvailability[]>([]);
  const [detectingShells, setDetectingShells] = useState(true);
  const [homePath, setHomePath] = useState('~');
  const runtimeRef = useRef<Map<string, SessionRuntime>>(new Map());
  const sessionCounterRef = useRef(1);
  const didDetectShellsRef = useRef(false);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null,
    [activeSessionId, sessions],
  );
  const availableShellIds = useMemo(
    () => availableShells.filter((shell) => shell.available).map((shell) => shell.id),
    [availableShells],
  );
  const shellLookup = useMemo(
    () => new Map(TERMINAL_SHELLS.map((shell) => [shell.id, shell])),
    [],
  );
  const availabilityLookup = useMemo(
    () => new Map(availableShells.map((shell) => [shell.id, shell])),
    [availableShells],
  );

  const updateSession = useCallback((sessionId: string, recipe: (session: TerminalSession) => TerminalSession) => {
    setSessions((currentSessions) => currentSessions.map((session) => (
      session.id === sessionId ? recipe(session) : session
    )));
  }, []);

  const appendOutput = useCallback((sessionId: string, kind: TerminalOutputKind, text: string) => {
    updateSession(sessionId, (session) => ({
      ...session,
      output: appendOutputEntry(session.output, kind, text),
    }));
  }, [updateSession]);

  const setSessionCwd = useCallback((sessionId: string, cwd: string) => {
    updateSession(sessionId, (session) => ({
      ...session,
      cwd,
      error: undefined,
    }));
  }, [updateSession]);

  const flushStdout = useCallback((sessionId: string, chunk: string, flushRemainder = false) => {
    const runtime = runtimeRef.current.get(sessionId);
    if (!runtime) {
      if (chunk) {
        appendOutput(sessionId, 'stdout', chunk);
      }
      return;
    }

    const marker = runtime.marker;
    if (!marker) {
      runtime.stdoutCarry = '';
      if (chunk) {
        appendOutput(sessionId, 'stdout', chunk);
      }
      return;
    }

    const combined = `${runtime.stdoutCarry}${chunk}`;
    const markerIndex = combined.indexOf(marker);

    if (markerIndex === -1) {
      if (flushRemainder) {
        runtime.stdoutCarry = '';
        if (combined) {
          appendOutput(sessionId, 'stdout', combined);
        }
        return;
      }

      const safeLength = Math.max(0, combined.length - marker.length + 1);
      const emitText = combined.slice(0, safeLength);
      runtime.stdoutCarry = combined.slice(safeLength);
      if (emitText) {
        appendOutput(sessionId, 'stdout', emitText);
      }
      return;
    }

    const beforeMarker = combined.slice(0, markerIndex);
    if (beforeMarker) {
      appendOutput(sessionId, 'stdout', beforeMarker);
    }

    const afterMarker = combined.slice(markerIndex + marker.length);
    const newlineIndex = afterMarker.indexOf('\n');
    if (newlineIndex === -1) {
      if (flushRemainder) {
        runtime.stdoutCarry = '';
        appendOutput(sessionId, 'stdout', `${marker}${afterMarker}`);
      } else {
        runtime.stdoutCarry = combined.slice(markerIndex);
      }
      return;
    }

    const nextCwd = afterMarker.slice(0, newlineIndex).replace(/\r$/, '');
    if (nextCwd) {
      setSessionCwd(sessionId, nextCwd);
    }

    runtime.stdoutCarry = '';
    const remainder = afterMarker.slice(newlineIndex + 1);
    if (remainder) {
      appendOutput(sessionId, 'stdout', remainder);
    }
  }, [appendOutput, setSessionCwd]);

  const stopChildProcess = useCallback(async (sessionId: string) => {
    const runtime = runtimeRef.current.get(sessionId);
    if (!runtime?.child) {
      return;
    }

    runtime.interrupted = true;
    await runtime.child.kill().catch(() => undefined);
  }, []);

  const finishCommand = useCallback((sessionId: string, code: number | null, signal: number | null) => {
    const runtime = runtimeRef.current.get(sessionId);
    if (runtime) {
      flushStdout(sessionId, '', true);
      runtime.child = null;
      runtime.marker = null;
      runtime.stdoutCarry = '';
    }

    updateSession(sessionId, (session) => ({
      ...session,
      running: false,
      input: '',
      draftInput: '',
      historyIndex: null,
      lastExitCode: code,
    }));

    if (runtime?.interrupted) {
      runtime.interrupted = false;
      appendOutput(sessionId, 'system', 'Command interrupted.\n');
      return;
    }

    if (signal !== null) {
      appendOutput(sessionId, 'system', `Command exited with signal ${signal}.\n`);
      return;
    }

    if (code !== null && code !== 0) {
      appendOutput(sessionId, 'system', `Command exited with code ${code}.\n`);
    }
  }, [appendOutput, flushStdout, updateSession]);

  useEffect(() => {
    if (didDetectShellsRef.current) {
      return;
    }
    didDetectShellsRef.current = true;

    let cancelled = false;

    const detectShells = async () => {
      setDetectingShells(true);

      const [resolvedHomePath, detectedShells] = await Promise.all([
        homeDir().catch(() => '~'),
        Promise.all(TERMINAL_SHELLS.map((shell) => detectTerminalShell(shell))),
      ]);

      if (cancelled) {
        return;
      }

      setHomePath(resolvedHomePath);
      const orderedShells = getTerminalShellOrder(platform)
        .map((shellId) => detectedShells.find((shell) => shell.id === shellId))
        .filter((shell): shell is NonNullable<typeof shell> => shell !== undefined);
      setAvailableShells(orderedShells);

      const nextAvailableShellIds = orderedShells.filter((shell) => shell.available).map((shell) => shell.id);
      const nextDefaultShellId = resolvePreferredShell(platform, nextAvailableShellIds, defaultShellId);
      if (nextDefaultShellId !== defaultShellId) {
        setDefaultShellId(nextDefaultShellId);
      }

      setSessions((currentSessions) => currentSessions.map((session) => {
        const availability = orderedShells.find((shell) => shell.id === session.shellId);
        const nextShellId = availability?.available
          ? session.shellId
          : resolvePreferredShell(platform, nextAvailableShellIds, session.shellId);

        return {
          ...session,
          shellId: nextShellId,
          cwd: session.cwd === '~' ? resolvedHomePath : session.cwd,
          error: availability?.available
            ? undefined
            : getFriendlyMissingShellMessage(shellLookup.get(session.shellId)?.label ?? session.shellId),
        };
      }));
      setDetectingShells(false);
    };

    void detectShells();

    return () => {
      cancelled = true;
    };
  }, [defaultShellId, platform, setDefaultShellId, shellLookup]);

  useEffect(() => () => {
    for (const runtime of runtimeRef.current.values()) {
      void runtime.child?.kill().catch(() => undefined);
    }
  }, []);

  const createSession = useCallback((shellId?: TerminalShellId) => {
    const nextShellId = resolvePreferredShell(platform, availableShellIds, shellId ?? defaultShellId);
    sessionCounterRef.current += 1;
    const nextSession = createSessionState(nextShellId, homePath, sessionCounterRef.current);
    setSessions((currentSessions) => [...currentSessions, nextSession]);
    setActiveSessionId(nextSession.id);
  }, [availableShellIds, defaultShellId, homePath, platform]);

  const closeSession = useCallback((sessionId: string) => {
    void stopChildProcess(sessionId);
    runtimeRef.current.delete(sessionId);

    const currentSessions = sessions;
    const closingIndex = currentSessions.findIndex((session) => session.id === sessionId);
    const remainingSessions = currentSessions.filter((session) => session.id !== sessionId);

    if (!remainingSessions.length) {
      sessionCounterRef.current += 1;
      const replacementShellId = resolvePreferredShell(platform, availableShellIds, defaultShellId);
      const replacementSession = createSessionState(replacementShellId, homePath, sessionCounterRef.current);
      setSessions([replacementSession]);
      setActiveSessionId(replacementSession.id);
      return;
    }

    setSessions(remainingSessions);
    if (activeSessionId === sessionId) {
      const nextActiveSession = remainingSessions[Math.max(0, closingIndex - 1)] ?? remainingSessions[0];
      setActiveSessionId(nextActiveSession.id);
    }
  }, [activeSessionId, availableShellIds, defaultShellId, homePath, platform, sessions, stopChildProcess]);

  const clearSession = useCallback((sessionId: string) => {
    updateSession(sessionId, (session) => ({
      ...session,
      output: [],
      error: undefined,
    }));
  }, [updateSession]);

  const setSessionInput = useCallback((sessionId: string, value: string) => {
    updateSession(sessionId, (session) => ({
      ...session,
      input: value,
      draftInput: value,
      historyIndex: null,
    }));
  }, [updateSession]);

  const setSessionShell = useCallback((sessionId: string, shellId: TerminalShellId) => {
    const availability = availabilityLookup.get(shellId);
    updateSession(sessionId, (session) => ({
      ...session,
      shellId,
      error: availability?.available ? undefined : getFriendlyMissingShellMessage(availability?.label ?? shellId),
    }));
  }, [availabilityLookup, updateSession]);

  const navigateHistory = useCallback((sessionId: string, direction: 'up' | 'down') => {
    updateSession(sessionId, (session) => {
      if (!session.history.length) {
        return session;
      }

      const baseIndex = session.historyIndex ?? session.history.length;
      const nextIndex = direction === 'up'
        ? Math.max(0, baseIndex - 1)
        : Math.min(session.history.length, baseIndex + 1);

      if (nextIndex === session.history.length) {
        return {
          ...session,
          historyIndex: null,
          input: session.draftInput,
        };
      }

      return {
        ...session,
        historyIndex: nextIndex,
        input: session.history[nextIndex] ?? '',
      };
    });
  }, [updateSession]);

  const runCommand = useCallback(async (sessionId: string) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }

    const rawCommand = session.input.trim();
    if (!rawCommand || session.running) {
      return;
    }

    const shell = getTerminalShellDefinition(session.shellId);
    const availability = availabilityLookup.get(session.shellId);
    if (!shell || !availability?.available) {
      const message = getFriendlyMissingShellMessage(availability?.label ?? session.shellId);
      updateSession(sessionId, (currentSession) => ({
        ...currentSession,
        error: message,
      }));
      appendOutput(sessionId, 'system', `${message}\n`);
      return;
    }

    const marker = createShellMarker();
    const runtime: SessionRuntime = {
      child: null,
      marker,
      stdoutCarry: '',
      interrupted: false,
    };
    runtimeRef.current.set(sessionId, runtime);

    const commandLine = `[${shell.label}] ${session.cwd || homePath}> ${rawCommand}\n`;
    updateSession(sessionId, (currentSession) => ({
      ...currentSession,
      input: '',
      draftInput: '',
      historyIndex: null,
      running: true,
      error: undefined,
      lastExitCode: null,
      history: currentSession.history.at(-1) === rawCommand
        ? currentSession.history
        : [...currentSession.history, rawCommand],
      output: appendOutputEntry(currentSession.output, 'command', commandLine),
    }));

    const command = Command.create(
      availability.commandName ?? session.shellId,
      shell.spawnArgs,
      { cwd: session.cwd || homePath },
    );

    command.stdout.on('data', (data) => {
      flushStdout(sessionId, String(data));
    });
    command.stderr.on('data', (data) => {
      appendOutput(sessionId, 'stderr', String(data));
    });
    command.on('close', ({ code, signal }) => {
      finishCommand(sessionId, code, signal);
    });
    command.on('error', (error) => {
      const message = formatShellError(error);
      updateSession(sessionId, (currentSession) => ({
        ...currentSession,
        running: false,
        error: message,
      }));
      appendOutput(sessionId, 'system', `${message}\n`);
      const currentRuntime = runtimeRef.current.get(sessionId);
      if (currentRuntime) {
        currentRuntime.child = null;
        currentRuntime.marker = null;
        currentRuntime.stdoutCarry = '';
        currentRuntime.interrupted = false;
      }
    });

    try {
      runtime.child = await command.spawn();
      await runtime.child.write(`${shell.buildCommandPayload(rawCommand, marker)}\n`);
    } catch (error) {
      const message = formatShellError(error);
      updateSession(sessionId, (currentSession) => ({
        ...currentSession,
        running: false,
        error: message,
      }));
      appendOutput(sessionId, 'system', `${message}\n`);
      runtimeRef.current.delete(sessionId);
    }
  }, [appendOutput, availabilityLookup, finishCommand, flushStdout, homePath, sessions, updateSession]);

  const interruptSession = useCallback(async (sessionId: string) => {
    const runtime = runtimeRef.current.get(sessionId);
    if (!runtime?.child) {
      return;
    }

    await stopChildProcess(sessionId);
  }, [stopChildProcess]);

  const availableShellOptions = useMemo(
    () => getTerminalShellOrder(platform).map((shellId) => {
      const availability = availabilityLookup.get(shellId);
      return {
        value: shellId,
        label: availability?.label ?? shellId,
        disabled: !availability?.available,
      };
    }),
    [availabilityLookup, platform],
  );

  return {
    platform,
    sessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    createSession,
    closeSession,
    clearSession,
    setSessionInput,
    setSessionShell,
    navigateHistory,
    runCommand,
    interruptSession,
    availableShells,
    availableShellIds,
    availableShellOptions,
    detectingShells,
    defaultShellId: resolvePreferredShell(platform, availableShellIds, defaultShellId),
    setDefaultShellId,
    homePath,
    shellLookup,
    shellMarkerPrefix: TERMINAL_SHELL_MARKER_PREFIX,
  };
}
