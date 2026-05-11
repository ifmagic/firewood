import type { TerminalPlatform, TerminalShellDefinition, TerminalShellId } from './types';

export const TERMINAL_DEFAULT_SHELL_STORAGE_KEY = 'tool:terminal:default-shell';
export const TERMINAL_FONT_STACK = "'CaskaydiaCove Nerd Font', 'JetBrainsMono Nerd Font', 'MesloLGS NF', 'FiraCode Nerd Font', 'JetBrains Mono', 'Fira Code', 'SFMono-Regular', 'Cascadia Mono', ui-monospace, monospace";
export const TERMINAL_SHELL_MARKER_PREFIX = '__FIREWOOD_TERMINAL_CWD__';

function buildPosixCommand(command: string, marker: string) {
  return `${command}\n__fw_terminal_status=$?\nprintf '%s\\n' "" "${marker}$PWD"\nexit $__fw_terminal_status`;
}

function buildFishCommand(command: string, marker: string) {
  return `${command}\nset __fw_terminal_status $status\nprintf '%s\\n' "" "${marker}$PWD"\nexit $__fw_terminal_status`;
}

function buildPowerShellCommand(command: string, marker: string) {
  const escapedMarker = marker.replace(/'/g, "''");
  return `${command}\n$__fwTerminalStatus = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } elseif ($?) { 0 } else { 1 }\nWrite-Output ''\nWrite-Output ('${escapedMarker}' + (Get-Location).Path)\nexit $__fwTerminalStatus`;
}

export const TERMINAL_SHELLS: TerminalShellDefinition[] = [
  {
    id: 'zsh',
    label: 'zsh',
    commandCandidates: [
      { name: 'terminal-zsh-homebrew', cmd: '/opt/homebrew/bin/zsh' },
      { name: 'terminal-zsh-local', cmd: '/usr/local/bin/zsh' },
      { name: 'terminal-zsh-system', cmd: '/bin/zsh' },
      { name: 'terminal-zsh', cmd: 'zsh' },
    ],
    detectArgs: ['-lc', 'printf ready'],
    spawnArgs: [],
    buildCommandPayload: buildPosixCommand,
  },
  {
    id: 'bash',
    label: 'bash',
    commandCandidates: [
      { name: 'terminal-bash-system', cmd: '/bin/bash' },
      { name: 'terminal-bash-homebrew', cmd: '/opt/homebrew/bin/bash' },
      { name: 'terminal-bash-local', cmd: '/usr/local/bin/bash' },
      { name: 'terminal-bash', cmd: 'bash' },
    ],
    detectArgs: ['-lc', 'printf ready'],
    spawnArgs: [],
    buildCommandPayload: buildPosixCommand,
  },
  {
    id: 'fish',
    label: 'fish',
    commandCandidates: [
      { name: 'terminal-fish-homebrew', cmd: '/opt/homebrew/bin/fish' },
      { name: 'terminal-fish-local', cmd: '/usr/local/bin/fish' },
      { name: 'terminal-fish-system', cmd: '/bin/fish' },
      { name: 'terminal-fish', cmd: 'fish' },
    ],
    detectArgs: ['-lc', 'printf ready'],
    spawnArgs: [],
    buildCommandPayload: buildFishCommand,
  },
  {
    id: 'pwsh',
    label: 'PowerShell (pwsh)',
    commandCandidates: [
      { name: 'terminal-pwsh-homebrew', cmd: '/opt/homebrew/bin/pwsh' },
      { name: 'terminal-pwsh-local', cmd: '/usr/local/bin/pwsh' },
      { name: 'terminal-pwsh', cmd: 'pwsh' },
    ],
    detectArgs: ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'],
    spawnArgs: ['-NoLogo', '-NoProfile', '-Command', '-'],
    buildCommandPayload: buildPowerShellCommand,
  },
  {
    id: 'powershell',
    label: 'Windows PowerShell',
    commandCandidates: [
      { name: 'terminal-powershell', cmd: 'powershell' },
      { name: 'terminal-powershell-exe', cmd: 'powershell.exe' },
    ],
    detectArgs: ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'],
    spawnArgs: ['-NoLogo', '-NoProfile', '-Command', '-'],
    buildCommandPayload: buildPowerShellCommand,
  },
];

export function getTerminalPlatform(): TerminalPlatform {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('win')) {
    return 'windows';
  }
  if (userAgent.includes('mac')) {
    return 'macos';
  }
  return 'linux';
}

export function getTerminalShellDefinition(shellId: TerminalShellId) {
  return TERMINAL_SHELLS.find((shell) => shell.id === shellId);
}

export function getTerminalShellOrder(platform: TerminalPlatform) {
  return platform === 'windows'
    ? ['pwsh', 'powershell', 'zsh', 'bash', 'fish'] satisfies TerminalShellId[]
    : ['zsh', 'bash', 'fish', 'pwsh', 'powershell'] satisfies TerminalShellId[];
}

export function resolvePreferredShell(
  platform: TerminalPlatform,
  availableShellIds: TerminalShellId[],
  preferredShellId?: TerminalShellId | null,
) {
  if (preferredShellId && availableShellIds.includes(preferredShellId)) {
    return preferredShellId;
  }

  const orderedShells = getTerminalShellOrder(platform);
  return orderedShells.find((shellId) => availableShellIds.includes(shellId)) ?? preferredShellId ?? orderedShells[0];
}

export function createTerminalSessionTitle(index: number) {
  return `Terminal ${index}`;
}

export function createShellMarker() {
  return `${TERMINAL_SHELL_MARKER_PREFIX}${Math.random().toString(36).slice(2, 10)}:`;
}

export function formatShellError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'The shell could not be started.';
}
