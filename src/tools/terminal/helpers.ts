import i18n from '../../i18n';

export interface BufferedOutputState {
  bufferedOutput: string[];
  bufferedChars: number;
}

export const MAX_BUFFER_CHARS = 100_000;

export function appendBufferedOutput(tab: BufferedOutputState, data: string) {
  if (!data) return;
  tab.bufferedOutput.push(data);
  tab.bufferedChars += data.length;

  while (tab.bufferedChars > MAX_BUFFER_CHARS && tab.bufferedOutput.length > 0) {
    const removed = tab.bufferedOutput.shift() ?? '';
    tab.bufferedChars -= removed.length;
  }
}

export function clearBufferedOutput(tab: BufferedOutputState) {
  tab.bufferedOutput = [];
  tab.bufferedChars = 0;
}

export function selectActiveTab<T extends { id: string }>(tabs: T[], activeId: string | null): string | null {
  if (activeId && tabs.some((tab) => tab.id === activeId)) {
    return activeId;
  }
  return tabs[0]?.id ?? null;
}

export function getShellDisplayName(shellPath: string | null, defaultShell: string) {
  const target = shellPath || defaultShell;
  if (!target) return i18n.t('terminal.defaultShellName');
  return target.split(/[\\/]/).pop() || target;
}

export function buildShellOptions(defaultShell: string, availableShells: string[], currentShell: string) {
  return [...new Set([defaultShell, ...availableShells, currentShell].filter(Boolean))];
}

export function toShellOverride(selectedShell: string, defaultShell: string) {
  return selectedShell === defaultShell ? null : selectedShell;
}
