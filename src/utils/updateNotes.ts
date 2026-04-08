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

/** 只保留 release notes 中变更说明部分，去掉下载/安装说明 */
export function extractChangelog(body: string | null): string {
  if (!body) return '包含最新功能与问题修复。';
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
 * 从 build.yml 原始内容中解析 release body。
 * 解析 github-script 中 `body: \`...\`` 模板字面量的内容。
 */
export function parseReleaseBodyFromBuildYml(raw: string): string {
  const jsMarker = 'body: `';
  const jsIdx = raw.indexOf(jsMarker);
  if (jsIdx === -1) return '';

  const start = jsIdx + jsMarker.length;
  // 找到闭合的反引号（考虑转义 \`）
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

  // 第一行与 `body: \`` 同行，缩进为 0；用后续非空行计算公共缩进
  let blockIndent = 0;
  for (let idx = 1; idx < lines.length; idx++) {
    if (lines[idx].trim() === '') continue;
    blockIndent = lines[idx].length - lines[idx].trimStart().length;
    break;
  }

  const bodyLines = lines.map(line =>
    line.trim() === '' ? '' : (blockIndent > 0 && line.length >= blockIndent ? line.slice(blockIndent) : line.trimStart())
  );

  while (bodyLines.length > 0 && bodyLines[0].trim() === '') bodyLines.shift();
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') bodyLines.pop();

  return bodyLines.join('\n');
}

/**
 * 从本地 build.yml（构建时内联）获取当前版本的发布说明。
 */
export function getLocalReleaseNotes(buildYmlRaw: string, version: string): ReleaseNotesResult {
  const fullBody = parseReleaseBodyFromBuildYml(buildYmlRaw);
  const changelog = extractChangelog(fullBody);
  return {
    version: version.replace(/^v/, ''),
    body: changelog || '包含最新功能与问题修复。',
  };
}
