import type { TerminalPlatform, TerminalShellDefinition, TerminalShellId } from './types';

export const TERMINAL_DEFAULT_SHELL_STORAGE_KEY = 'tool:terminal:default-shell';
export const TERMINAL_FONT_STACK = "'CaskaydiaCove Nerd Font', 'JetBrainsMono Nerd Font', 'MesloLGS NF', 'FiraCode Nerd Font', 'JetBrains Mono', 'Fira Code', 'SFMono-Regular', 'Cascadia Mono', ui-monospace, monospace";

function buildPosixCommand(command: string) {
  return `${command}`;
}

function buildPowerShellCommand(command: string) {
  return `${command}`;
}

function buildCmdCommand(command: string) {
  return `${command}`;
}

export const TERMINAL_SHELLS: TerminalShellDefinition[] = [
  {
    id: 'zsh',
    label: 'zsh',
    sidecar: 'terminal-zsh',
    command: '/bin/zsh',
    commandPaths: [
      '/opt/homebrew/bin/zsh',
      '/usr/local/bin/zsh',
      '/bin/zsh',
      '/usr/bin/zsh',
    ],
    fallbackCommand: 'zsh',
    detectArgs: true,
    spawnArgs: ['-i', '-c'],
    buildCommandPayload: buildPosixCommand,
    supportedPlatforms: ['macos', 'linux'],
  },
  {
    id: 'bash',
    label: 'bash',
    sidecar: 'terminal-bash',
    command: '/bin/bash',
    commandPaths: [
      '/opt/homebrew/bin/bash',
      '/usr/local/bin/bash',
      '/bin/bash',
      '/usr/bin/bash',
    ],
    fallbackCommand: 'bash',
    detectArgs: true,
    spawnArgs: ['-i', '-c'],
    buildCommandPayload: buildPosixCommand,
    supportedPlatforms: ['macos', 'linux'],
  },
  {
    id: 'fish',
    label: 'fish',
    sidecar: 'terminal-fish',
    command: '/bin/fish',
    commandPaths: [
      '/opt/homebrew/bin/fish',
      '/usr/local/bin/fish',
      '/bin/fish',
      '/usr/bin/fish',
    ],
    fallbackCommand: 'fish',
    detectArgs: true,
    spawnArgs: ['-i', '-c'],
    buildCommandPayload: buildPosixCommand,
    supportedPlatforms: ['macos', 'linux'],
  },
  {
    id: 'pwsh',
    label: 'PowerShell',
    sidecar: 'terminal-pwsh',
    command: '/usr/local/bin/pwsh',
    commandPaths: [
      '/opt/homebrew/bin/pwsh',
      '/usr/local/bin/pwsh',
      '/usr/bin/pwsh',
    ],
    fallbackCommand: 'pwsh',
    detectArgs: ['-NoLogo', '-NoProfile', '-Command'],
    spawnArgs: ['-NoLogo', '-NoProfile', '-Command', '-'],
    buildCommandPayload: buildPowerShellCommand,
    supportedPlatforms: ['macos', 'linux', 'windows'],
  },
  {
    id: 'powershell',
    label: 'Windows PowerShell',
    sidecar: 'terminal-powershell',
    command: 'powershell.exe',
    commandPaths: [
      'powershell.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ],
    fallbackCommand: 'powershell',
    detectArgs: ['-NoLogo', '-NoProfile', '-Command'],
    spawnArgs: ['-NoLogo', '-NoProfile', '-Command', '-'],
    buildCommandPayload: buildPowerShellCommand,
    supportedPlatforms: ['windows'],
  },
  {
    id: 'cmd',
    label: 'Command Prompt',
    sidecar: 'terminal-cmd',
    command: 'cmd.exe',
    commandPaths: [
      'cmd.exe',
      'C:\\Windows\\System32\\cmd.exe',
    ],
    fallbackCommand: 'cmd',
    detectArgs: ['/c', 'echo'],
    spawnArgs: ['/c'],
    buildCommandPayload: buildCmdCommand,
    supportedPlatforms: ['windows'],
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

export function getShellsForPlatform(platform: TerminalPlatform) {
  return TERMINAL_SHELLS.filter((shell) => shell.supportedPlatforms.includes(platform));
}

export function getDefaultShellForPlatform(platform: TerminalPlatform): TerminalShellId {
  const shells = getShellsForPlatform(platform);
  return shells[0]?.id ?? 'bash';
}

export function formatShellError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'Failed to execute command';
}
