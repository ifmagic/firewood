export type TerminalShellId = 'zsh' | 'bash' | 'fish' | 'pwsh' | 'powershell' | 'cmd';

export type TerminalPlatform = 'macos' | 'windows' | 'linux';

export type TerminalOutputKind = 'command' | 'stdout' | 'stderr' | 'system';

export interface TerminalShellDefinition {
  id: TerminalShellId;
  label: string;
  sidecar: string;
  command: string;
  commandPaths: string[];
  fallbackCommand: string;
  detectArgs: boolean | string[];
  spawnArgs: string[];
  buildCommandPayload: (command: string) => string;
  supportedPlatforms: TerminalPlatform[];
}

export interface TerminalShellAvailability {
  id: TerminalShellId;
  label: string;
  available: boolean;
  command: string;
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
  history: string[];
  historyIndex: number | null;
  output: TerminalOutputEntry[];
  running: boolean;
  lastExitCode: number | null;
}
