/** Type definitions aligned with the Rust DTOs in `src-tauri/src/moxia/dto.rs`. */

export interface BookInfo {
  path: string;
  title: string;
  genre: string;
  status: string;
  description: string;
  worldbuilding: string;
  wordCount: number;
  chapterCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookMeta {
  title: string;
  genre: string;
  status: string;
  description: string;
  worldbuilding: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: number;
  title: string;
  content: string;
  sortOrder: number;
  wordCount: number;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterSummary {
  id: number;
  title: string;
  sortOrder: number;
  wordCount: number;
  status: string;
  updatedAt: string;
}

export interface Character {
  id: number;
  name: string;
  roleType: string;
  description: string;
  personality: string;
  background: string;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterSummary {
  id: number;
  name: string;
  roleType: string;
  updatedAt: string;
}

export interface CharacterRelation {
  id: number;
  characterId: number;
  relatedId: number;
  relatedName: string;
  relationType: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

/** Library index entry, persisted to localStorage. */
export interface LibraryEntry {
  path: string;
  title: string;
  lastOpenedAt: string;
}

/** Node type for the left-panel navigation tree. */
export type ItemType = 'book' | 'chapter' | 'character' | 'character_group';

/** The currently selected item. */
export interface Selection {
  type: ItemType;
  id: number;
}

/** Editor field name (used by the Editor component to bind to the store). */
export type EditorField = 'description' | 'worldbuilding' | 'content' | 'notes' | 'personality' | 'background';
