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

export function countCodePoints(text: string) {
  let count = 0;
  for (let i = 0; i < text.length;) {
    const code = text.charCodeAt(i);
    i += code >= 0xd800 && code <= 0xdbff ? 2 : 1;
    count++;
  }
  return count;
}
