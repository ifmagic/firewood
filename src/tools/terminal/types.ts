export type TerminalShellId = 'zsh' | 'bash' | 'fish' | 'pwsh' | 'powershell';

export type TerminalPlatform = 'macos' | 'windows' | 'linux';

export type TerminalOutputKind = 'command' | 'stdout' | 'stderr' | 'system';

export interface TerminalShellDefinition {
  id: TerminalShellId;
  label: string;
  commandCandidates: Array<{
    name: string;
    cmd: string;
  }>;
  detectArgs: string[];
  spawnArgs: string[];
  buildCommandPayload: (command: string, marker: string) => string;
}

export interface TerminalShellAvailability {
  id: TerminalShellId;
  label: string;
  available: boolean;
  commandName?: string;
  commandPath?: string;
  error?: string;
}

export interface TerminalOutputEntry {
  id: string;
  kind: TerminalOutputKind;
  text: string;
}

export interface TerminalSession {
  id: string;
  title: string;
  shellId: TerminalShellId;
  cwd: string;
  input: string;
  draftInput: string;
  history: string[];
  historyIndex: number | null;
  output: TerminalOutputEntry[];
  running: boolean;
  lastExitCode: number | null;
  error?: string;
}
