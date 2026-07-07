/** Ported from the original moxia `viewmodels/enums.py`. */

export const GENRES = ['奇幻', '科幻', '都市', '悬疑', '历史', '言情', '武侠', '其他'] as const;

export const ROLE_TYPES = ['主角', '配角', '反派', '路人', '其他'] as const;

export const RELATION_TYPES = ['家人', '朋友', '恋人', '师徒', '敌对', '上下级', '同窗', '其他'] as const;

export const BOOK_STATUS_LABELS = ['草稿', '写作中', '已完成'] as const;
export const BOOK_STATUS_KEYS = ['draft', 'writing', 'completed'] as const;

export const CHAPTER_STATUS_LABELS = ['草稿', '写作中', '已完成'] as const;
export const CHAPTER_STATUS_KEYS = ['draft', 'writing', 'completed'] as const;

const BOOK_STATUS_TO_LABEL: Record<string, string> = Object.fromEntries(
  BOOK_STATUS_KEYS.map((k, i) => [k, BOOK_STATUS_LABELS[i]]),
);
const BOOK_STATUS_TO_KEY: Record<string, string> = Object.fromEntries(
  BOOK_STATUS_LABELS.map((l, i) => [l, BOOK_STATUS_KEYS[i]]),
);
const CHAPTER_STATUS_TO_LABEL: Record<string, string> = Object.fromEntries(
  CHAPTER_STATUS_KEYS.map((k, i) => [k, CHAPTER_STATUS_LABELS[i]]),
);
const CHAPTER_STATUS_TO_KEY: Record<string, string> = Object.fromEntries(
  CHAPTER_STATUS_LABELS.map((l, i) => [l, CHAPTER_STATUS_KEYS[i]]),
);

export function bookStatusToLabel(key: string): string {
  return BOOK_STATUS_TO_LABEL[key] ?? '';
}

export function bookStatusToKey(label: string): string {
  return BOOK_STATUS_TO_KEY[label] ?? 'draft';
}

export function chapterStatusToLabel(key: string): string {
  return CHAPTER_STATUS_TO_LABEL[key] ?? '';
}

export function chapterStatusToKey(label: string): string {
  return CHAPTER_STATUS_TO_KEY[label] ?? 'draft';
}

/** Parses the chapter title prefix: matches the pattern "第N章" (Chapter N). */
const CHAPTER_PREFIX_RE = /^第\d+章/;

export function parseChapterPrefix(title: string): { prefix: string; suffix: string } {
  const m = title.match(CHAPTER_PREFIX_RE);
  if (m) {
    return {
      prefix: m[0],
      suffix: title.slice(m[0].length).trimStart(),
    };
  }
  return { prefix: '', suffix: title };
}

/** CJK-friendly word count: counts characters after removing all whitespace. */
export function countWords(s: string): number {
  const cleaned = Array.from(s)
    .filter((c) => !/\s/.test(c))
    .join('');
  return Array.from(cleaned).length;
}

/** Number formatting with thousands separators. Returns '0' for undefined/null/NaN (defensive, avoids white screen when backend fields are missing). */
export function formatNumber(n?: number | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}
