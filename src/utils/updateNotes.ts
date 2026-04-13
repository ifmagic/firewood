export interface UpdateNotesCache {
  version: string;
  body: string;
  checkedAt: number;
}

const UPDATE_NOTES_CACHE_KEY = 'firewood.updateNotesCache';

interface ReleaseNotesResult {
  version: string;
  body: string;
}

/** Strip everything after the first horizontal rule, keeping only the changelog */
export function extractChangelog(body: string | null): string {
  if (!body) return '';
  const cutoff = body.search(/^---+$/m);
  const section = cutoff > 0 ? body.slice(0, cutoff) : body;
  return section.trim();
}

export function cacheUpdateNotes(data: UpdateNotesCache) {
  try {
    localStorage.setItem(UPDATE_NOTES_CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

export function readUpdateNotesCache(): UpdateNotesCache | null {
  try {
    const raw = localStorage.getItem(UPDATE_NOTES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UpdateNotesCache;
    if (!parsed.version || !parsed.body) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Parse the release body from the raw build.yml content.
 * Extracts the `body: \`...\`` template literal from the github-script section.
 */
export function parseReleaseBodyFromBuildYml(raw: string): string {
  const jsMarker = 'body: `';
  const jsIdx = raw.indexOf(jsMarker);
  if (jsIdx === -1) return '';

  const start = jsIdx + jsMarker.length;
  // Find the closing backtick (accounting for escaped \`)
  let i = start;
  while (i < raw.length) {
    if (raw[i] === '\\' && i + 1 < raw.length) {
      i += 2;
      continue;
    }
    if (raw[i] === '`') break;
    i++;
  }
  if (i >= raw.length) return '';

  const content = raw.slice(start, i)
    .replace(/\\`/g, '`');

  const lines = content.split('\n');

  // First line is on the same line as `body: \``, indent is 0; use subsequent non-empty lines to calculate common indent
  let blockIndent = 0;
  for (let idx = 1; idx < lines.length; idx++) {
    if (lines[idx].trim() === '') continue;
    blockIndent = lines[idx].length - lines[idx].trimStart().length;
    break;
  }

  const bodyLines = lines.map((line, idx) =>
    line.trim() === '' ? '' : (idx === 0 ? line : (blockIndent > 0 && line.length >= blockIndent ? line.slice(blockIndent) : line.trimStart()))
  );

  while (bodyLines.length > 0 && bodyLines[0].trim() === '') bodyLines.shift();
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') bodyLines.pop();

  return bodyLines.join('\n');
}

/**
 * Get release notes for the current version from the local build.yml (inlined at build time).
 */
export function getLocalReleaseNotes(buildYmlRaw: string, version: string): ReleaseNotesResult {
  const fullBody = parseReleaseBodyFromBuildYml(buildYmlRaw);
  const changelog = extractChangelog(fullBody);
  return {
    version: version.replace(/^v/, ''),
    body: changelog || 'Includes the latest features and bug fixes.',
  };
}
