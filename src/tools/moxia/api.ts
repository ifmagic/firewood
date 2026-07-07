import { invoke } from '@tauri-apps/api/core';
import type {
  BookInfo,
  BookMeta,
  Chapter,
  ChapterSummary,
  Character,
  CharacterRelation,
  CharacterSummary,
} from './types';

/**
 * Rust command invocation wrapper. All Tauri `invoke` calls go through here for unified error
 * handling and typed signatures. Command names match the `#[tauri::command]` functions in
 * `src-tauri/src/moxia/commands.rs`. Tauri converts parameter names to camelCase by default
 * (Rust `book_path` → frontend `bookPath`).
 */

// ============ Book ============

export function createBook(path: string, title: string, genre: string): Promise<BookInfo> {
  return invoke<BookInfo>('moxia_create_book', { path, title, genre });
}

export function openBook(path: string): Promise<BookInfo> {
  return invoke<BookInfo>('moxia_open_book', { path });
}

export function closeBook(path: string): Promise<void> {
  return invoke<void>('moxia_close_book', { path });
}

export function getBookMeta(bookPath: string): Promise<BookMeta> {
  return invoke<BookMeta>('moxia_get_book_meta', { bookPath });
}

export function updateBookMeta(bookPath: string, fields: Record<string, string>): Promise<void> {
  return invoke<void>('moxia_update_book_meta', { bookPath, fields });
}

// ============ Chapter ============

export function listChapters(bookPath: string): Promise<ChapterSummary[]> {
  return invoke<ChapterSummary[]>('moxia_list_chapters', { bookPath });
}

export function getChapter(bookPath: string, id: number): Promise<Chapter> {
  return invoke<Chapter>('moxia_get_chapter', { bookPath, id });
}

export function createChapter(bookPath: string, title: string, sortOrder: number): Promise<Chapter> {
  return invoke<Chapter>('moxia_create_chapter', { bookPath, title, sortOrder });
}

export function updateChapter(bookPath: string, id: number, fields: Record<string, string>): Promise<void> {
  return invoke<void>('moxia_update_chapter', { bookPath, id, fields });
}

export function deleteChapter(bookPath: string, id: number): Promise<void> {
  return invoke<void>('moxia_delete_chapter', { bookPath, id });
}

export function reorderChapters(bookPath: string, chapterIds: number[]): Promise<void> {
  return invoke<void>('moxia_reorder_chapters', { bookPath, chapterIds });
}

export function getNextChapterSortOrder(bookPath: string): Promise<number> {
  return invoke<number>('moxia_get_next_chapter_sort_order', { bookPath });
}

// ============ Character ============

export function listCharacters(bookPath: string): Promise<CharacterSummary[]> {
  return invoke<CharacterSummary[]>('moxia_list_characters', { bookPath });
}

export function getCharacter(bookPath: string, id: number): Promise<Character> {
  return invoke<Character>('moxia_get_character', { bookPath, id });
}

export function createCharacter(bookPath: string, name: string, roleType: string): Promise<Character> {
  return invoke<Character>('moxia_create_character', { bookPath, name, roleType });
}

export function updateCharacter(bookPath: string, id: number, fields: Record<string, string>): Promise<void> {
  return invoke<void>('moxia_update_character', { bookPath, id, fields });
}

export function deleteCharacter(bookPath: string, id: number): Promise<void> {
  return invoke<void>('moxia_delete_character', { bookPath, id });
}

// ============ CharacterRelation ============

export function listRelations(bookPath: string, characterId: number): Promise<CharacterRelation[]> {
  return invoke<CharacterRelation[]>('moxia_list_relations', { bookPath, characterId });
}

export function addRelation(
  bookPath: string,
  characterId: number,
  relatedId: number,
  relationType: string,
  description: string,
): Promise<CharacterRelation> {
  return invoke<CharacterRelation>('moxia_add_relation', {
    bookPath,
    characterId,
    relatedId,
    relationType,
    description,
  });
}

export function updateRelation(
  bookPath: string,
  relationId: number,
  relationType: string,
  description: string,
): Promise<void> {
  return invoke<void>('moxia_update_relation', {
    bookPath,
    relationId,
    relationType,
    description,
  });
}

export function deleteRelation(bookPath: string, relationId: number): Promise<void> {
  return invoke<void>('moxia_delete_relation', { bookPath, relationId });
}

// ============ Settings (per-book) ============

export function getSetting(bookPath: string, key: string): Promise<string | null> {
  return invoke<string | null>('moxia_get_setting', { bookPath, key });
}

export function setSetting(bookPath: string, key: string, value: string): Promise<void> {
  return invoke<void>('moxia_set_setting', { bookPath, key, value });
}

export function getAllSettings(bookPath: string): Promise<Record<string, string>> {
  return invoke<Record<string, string>>('moxia_get_all_settings', { bookPath });
}
