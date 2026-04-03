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
 * 从 build.yml 原始内容中解析 releaseBody 字段。
 * 利用 YAML block scalar（`|`）的缩进规则提取多行文本。
 */
export function parseReleaseBodyFromBuildYml(raw: string): string {
  const marker = 'releaseBody: |';
  const idx = raw.indexOf(marker);
  if (idx === -1) return '';

  const afterMarker = raw.slice(idx + marker.length);
  const lines = afterMarker.split('\n');

  // 找到 block scalar 的缩进级别（第一个非空行的缩进）
  let blockIndent = 0;
  for (const line of lines) {
    if (line.trim() === '') continue;
    blockIndent = line.length - line.trimStart().length;
    break;
  }

  if (blockIndent === 0) return '';

  const bodyLines: string[] = [];
  for (const line of lines) {
    // 空行保留
    if (line.trim() === '') {
      bodyLines.push('');
      continue;
    }
    const lineIndent = line.length - line.trimStart().length;
    // 缩进不足说明 block scalar 结束
    if (lineIndent < blockIndent) break;
    bodyLines.push(line.slice(blockIndent));
  }

  // 去掉首尾空行
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
