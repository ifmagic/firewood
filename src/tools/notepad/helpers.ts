import type { CodemirrorLanguage } from '../../hooks/useCodemirror';

export function getUrlAtColumn(line: string, column: number) {
  const urlRegex = /(https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+)/g;
  let match = urlRegex.exec(line);
  while (match) {
    const start = match.index + 1;
    const end = start + match[0].length - 1;
    if (column >= start && column <= end) {
      return match[0];
    }
    match = urlRegex.exec(line);
  }
  return null;
}

export function normalizeUrl(raw: string) {
  const trimmed = raw.trim().replace(/[),.;:!?\]}]+$/g, '');
  return trimmed.startsWith('www.') ? `https://${trimmed}` : trimmed;
}

export function detectLanguage(text: string): CodemirrorLanguage {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (
    /^<(!doctype|html|div|span|head|body|p\b|ul|ol|li|table|form|a\b|img|section|article|nav|header|footer)/i.test(
      trimmed,
    )
  )
    return 'html';
  if (/^(import |export |const |let |var |function |class |=>|\/\/)/.test(trimmed)) return 'javascript';
  return 'plaintext';
}

export function countCodePoints(text: string) {
  let count = 0;
  for (let i = 0; i < text.length; ) {
    const code = text.charCodeAt(i);
    i += code >= 0xd800 && code <= 0xdbff ? 2 : 1;
    count++;
  }
  return count;
}

/**
 * Best-effort JSON formatter: tries strict parse first, falls back to a
 * character-level pretty-printer that tolerates invalid / partial JSON.
 */
export function bestEffortFormatJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    // fall through
  }

  let result = '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  const indent = () => '  '.repeat(depth);

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      result += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString) {
      result += ch;
      continue;
    }

    if (/\s/.test(ch)) continue;

    if (ch === '{' || ch === '[') {
      result += ch;
      depth++;
      result += '\n' + indent();
    } else if (ch === '}' || ch === ']') {
      depth = Math.max(0, depth - 1);
      result += '\n' + indent() + ch;
    } else if (ch === ',') {
      result += ',\n' + indent();
    } else if (ch === ':') {
      result += ': ';
    } else {
      result += ch;
    }
  }

  return result;
}
