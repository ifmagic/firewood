import { create } from 'zustand';
import * as api from './api';
import { upsertLibraryEntry, setLastBookPath, clearLastBookPath } from './library';
import type {
  BookMeta,
  Chapter,
  ChapterSummary,
  Character,
  CharacterRelation,
  CharacterSummary,
  ItemType,
  LibraryEntry,
} from './types';

export type PageKind = 'empty' | 'book' | 'chapter' | 'character';

/** IDs for expandable nav folders in the left panel. */
export type NavGroupId = 'character' | 'chapter';

interface MoxiaState {
  // === Library ===
  library: LibraryEntry[];
  setLibrary: (entries: LibraryEntry[]) => void;

  // === Current book ===
  bookPath: string | null;
  bookMeta: BookMeta | null;
  bookMetaDirty: boolean;

  // === Left panel data ===
  chapters: ChapterSummary[];
  characters: CharacterSummary[];
  selectedType: ItemType | null;
  selectedId: number | null;
  page: PageKind;
  searchKeyword: string;
  expandedGroups: Set<NavGroupId>;

  // === Edit drafts ===
  chapterDraft: Chapter | null;
  chapterDirty: boolean;
  characterDraft: Character | null;
  characterDirty: boolean;
  relations: CharacterRelation[];
  characterCandidates: CharacterSummary[]; // characters in the current book excluding the one being edited

  // === Loading state ===
  loading: boolean;
  error: string | null;

  // === Actions ===
  openBook: (path: string) => Promise<void>;
  createBook: (path: string, title: string, genre: string) => Promise<void>;
  switchBook: (path: string) => Promise<void>;
  closeBook: () => Promise<void>;

  selectBook: () => Promise<void>;
  selectChapter: (id: number) => Promise<void>;
  selectCharacter: (id: number) => Promise<void>;
  clearSelection: () => void;

  setSearchKeyword: (kw: string) => void;
  toggleGroup: (id: NavGroupId) => void;

  // Book metadata editing
  patchBookMeta: (fields: Partial<BookMeta>) => void;
  markBookMetaDirty: () => void;
  saveBookMeta: () => Promise<void>;
  flushBookMeta: () => Promise<void>;

  // Chapter editing
  patchChapter: (fields: Partial<Chapter>) => void;
  markChapterDirty: () => void;
  saveChapter: () => Promise<void>;
  flushChapter: () => Promise<void>;

  // Character editing
  patchCharacter: (fields: Partial<Character>) => void;
  markCharacterDirty: () => void;
  saveCharacter: () => Promise<void>;
  flushCharacter: () => Promise<void>;

  // CRUD
  addChapter: (title: string) => Promise<void>;
  addCharacter: (name: string, roleType: string) => Promise<void>;
  deleteChapter: (id: number) => Promise<void>;
  deleteCharacter: (id: number) => Promise<void>;
  addRelation: (relatedId: number, relationType: string, description: string) => Promise<void>;
  updateRelation: (relationId: number, relationType: string, description: string) => Promise<void>;
  deleteRelation: (relationId: number) => Promise<void>;

  refreshLibraryFromDisk: () => void;
  refreshLibrarySilent: () => LibraryEntry[];
  setError: (msg: string | null) => void;
}

export const useMoxiaStore = create<MoxiaState>((set, get) => ({
  library: [],
  setLibrary: (entries) => set({ library: entries }),

  bookPath: null,
  bookMeta: null,
  bookMetaDirty: false,

  chapters: [],
  characters: [],
  selectedType: null,
  selectedId: null,
  page: 'empty',
  searchKeyword: '',
  // 'chapter' folder default expanded so chapters stay visible;
  // 'character' folder default collapsed (matches prior behavior).
  expandedGroups: new Set<NavGroupId>(['chapter']),

  chapterDraft: null,
  chapterDirty: false,
  characterDraft: null,
  characterDirty: false,
  relations: [],
  characterCandidates: [],

  loading: false,
  error: null,

  // ============ Library ============

  refreshLibraryFromDisk: () => {
    set({ library: get().refreshLibrarySilent() });
  },

  refreshLibrarySilent: () => {
    try {
      const raw = localStorage.getItem('moxia:library');
      if (!raw) return [];
      const parsed = JSON.parse(raw) as LibraryEntry[];
      if (!Array.isArray(parsed)) return [];
      return [...parsed].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
    } catch {
      return [];
    }
  },

  openBook: async (path) => {
    set({ loading: true, error: null });
    try {
      const info = await api.openBook(path);
      const meta = await api.getBookMeta(path);
      const chapters = await api.listChapters(path);
      const characters = await api.listCharacters(path);
      upsertLibraryEntry(path, info.title);
      setLastBookPath(path);
      set({
        bookPath: path,
        bookMeta: meta,
        chapters,
        characters,
        library: get().refreshLibrarySilent(),
        loading: false,
        page: 'empty',
        selectedType: null,
        selectedId: null,
        searchKeyword: '',
        chapterDraft: null,
        chapterDirty: false,
        characterDraft: null,
        characterDirty: false,
        relations: [],
      });
    } catch (e) {
      set({ loading: false, error: String(e) });
      throw e;
    }
  },

  createBook: async (path, title, genre) => {
    set({ loading: true, error: null });
    try {
      await api.createBook(path, title, genre);
      await get().openBook(path);
    } catch (e) {
      set({ loading: false, error: String(e) });
      throw e;
    }
  },

  switchBook: async (path) => {
    const oldPath = get().bookPath;
    await get().flushBookMeta();
    await get().flushChapter();
    await get().flushCharacter();
    await get().openBook(path);
    if (oldPath && oldPath !== path) {
      api.closeBook(oldPath).catch(() => {});
    }
  },

  closeBook: async () => {
    await get().flushBookMeta();
    await get().flushChapter();
    await get().flushCharacter();
    const oldPath = get().bookPath;
    if (oldPath) {
      api.closeBook(oldPath).catch(() => {});
    }
    clearLastBookPath();
    set({
      bookPath: null,
      bookMeta: null,
      chapters: [],
      characters: [],
      selectedType: null,
      selectedId: null,
      page: 'empty',
      searchKeyword: '',
      chapterDraft: null,
      characterDraft: null,
      relations: [],
    });
  },

  // ============ Selection ============

  selectBook: async () => {
    await get().flushChapter();
    await get().flushCharacter();
    set({
      selectedType: 'book',
      selectedId: null,
      page: 'book',
      chapterDraft: null,
      characterDraft: null,
      relations: [],
    });
  },

  selectChapter: async (id) => {
    await get().flushChapter();
    await get().flushCharacter();
    const path = get().bookPath;
    if (!path) return;
    try {
      const chapter = await api.getChapter(path, id);
      set({
        selectedType: 'chapter',
        selectedId: id,
        page: 'chapter',
        chapterDraft: chapter,
        chapterDirty: false,
        characterDraft: null,
        relations: [],
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  selectCharacter: async (id) => {
    await get().flushChapter();
    await get().flushCharacter();
    const path = get().bookPath;
    if (!path) return;
    try {
      const character = await api.getCharacter(path, id);
      const relations = await api.listRelations(path, id);
      const allChars = get().characters;
      const candidates = allChars.filter((c) => c.id !== id);
      set({
        selectedType: 'character',
        selectedId: id,
        page: 'character',
        characterDraft: character,
        characterDirty: false,
        relations,
        characterCandidates: candidates,
        chapterDraft: null,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  clearSelection: () => {
    set({
      selectedType: null,
      selectedId: null,
      page: 'empty',
      chapterDraft: null,
      characterDraft: null,
      relations: [],
    });
  },

  setSearchKeyword: (kw) => set({ searchKeyword: kw }),

  toggleGroup: (id) => {
    const s = new Set(get().expandedGroups);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    set({ expandedGroups: s });
  },

  // ============ Book metadata ============

  patchBookMeta: (fields) => {
    const cur = get().bookMeta;
    if (!cur) return;
    set({ bookMeta: { ...cur, ...fields }, bookMetaDirty: true });
  },

  markBookMetaDirty: () => set({ bookMetaDirty: true }),

  saveBookMeta: async () => {
    const { bookPath, bookMeta } = get();
    if (!bookPath || !bookMeta || !get().bookMetaDirty) return;
    try {
      const fields: Record<string, string> = {
        title: bookMeta.title,
        genre: bookMeta.genre,
        status: bookMeta.status,
        description: bookMeta.description,
        worldbuilding: bookMeta.worldbuilding,
      };
      await api.updateBookMeta(bookPath, fields);
      upsertLibraryEntry(bookPath, bookMeta.title);
      set({ bookMetaDirty: false, library: get().refreshLibrarySilent() });
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  flushBookMeta: async () => {
    if (get().bookMetaDirty) await get().saveBookMeta();
  },

  // ============ Chapter editing ============

  patchChapter: (fields) => {
    const cur = get().chapterDraft;
    if (!cur) return;
    // Sync title/status back to the chapters summary list so the left nav reflects edits live.
    const syncSummary = fields.title !== undefined || fields.status !== undefined;
    set({
      chapterDraft: { ...cur, ...fields },
      chapterDirty: true,
      ...(syncSummary
        ? {
            chapters: get().chapters.map((c) =>
              c.id === cur.id
                ? {
                    ...c,
                    ...(fields.title !== undefined ? { title: fields.title } : {}),
                    ...(fields.status !== undefined ? { status: fields.status } : {}),
                  }
                : c,
            ),
          }
        : {}),
    });
  },

  markChapterDirty: () => set({ chapterDirty: true }),

  saveChapter: async () => {
    const { bookPath, chapterDraft } = get();
    if (!bookPath || !chapterDraft || !get().chapterDirty) return;
    try {
      await api.updateChapter(bookPath, chapterDraft.id, {
        title: chapterDraft.title,
        content: chapterDraft.content,
        status: chapterDraft.status,
        notes: chapterDraft.notes,
      });
      const [chapters, meta] = await Promise.all([api.listChapters(bookPath), api.getBookMeta(bookPath)]);
      set({ chapterDirty: false, chapters, bookMeta: meta });
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  flushChapter: async () => {
    if (get().chapterDirty) await get().saveChapter();
  },

  // ============ Character editing ============

  patchCharacter: (fields) => {
    const cur = get().characterDraft;
    if (!cur) return;
    // Sync name/roleType back to the characters summary list so the left nav reflects edits live.
    const syncSummary = fields.name !== undefined || fields.roleType !== undefined;
    set({
      characterDraft: { ...cur, ...fields },
      characterDirty: true,
      ...(syncSummary
        ? {
            characters: get().characters.map((c) =>
              c.id === cur.id
                ? {
                    ...c,
                    ...(fields.name !== undefined ? { name: fields.name } : {}),
                    ...(fields.roleType !== undefined ? { roleType: fields.roleType } : {}),
                  }
                : c,
            ),
          }
        : {}),
    });
  },

  markCharacterDirty: () => set({ characterDirty: true }),

  saveCharacter: async () => {
    const { bookPath, characterDraft } = get();
    if (!bookPath || !characterDraft || !get().characterDirty) return;
    try {
      await api.updateCharacter(bookPath, characterDraft.id, {
        name: characterDraft.name,
        role_type: characterDraft.roleType,
        description: characterDraft.description,
        personality: characterDraft.personality,
        background: characterDraft.background,
      });
      const characters = await api.listCharacters(bookPath);
      const candidates = characters.filter((c) => c.id !== characterDraft.id);
      set({ characterDirty: false, characters, characterCandidates: candidates });
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  flushCharacter: async () => {
    if (get().characterDirty) await get().saveCharacter();
  },

  // ============ CRUD ============

  addChapter: async (title) => {
    const { bookPath } = get();
    if (!bookPath) return;
    const sortOrder = await api.getNextChapterSortOrder(bookPath);
    const chapter = await api.createChapter(bookPath, title, sortOrder);
    const chapters = await api.listChapters(bookPath);
    set({ chapters });
    // Auto-select the newly created chapter
    await get().selectChapter(chapter.id);
  },

  addCharacter: async (name, roleType) => {
    const { bookPath } = get();
    if (!bookPath) return;
    const character = await api.createCharacter(bookPath, name, roleType);
    const characters = await api.listCharacters(bookPath);
    set({ characters });
    // Auto-expand the character folder so the new entry is visible.
    const s = new Set(get().expandedGroups);
    s.add('character');
    set({ expandedGroups: s });
    await get().selectCharacter(character.id);
  },

  deleteChapter: async (id) => {
    const { bookPath } = get();
    if (!bookPath) return;
    await api.deleteChapter(bookPath, id);
    const chapters = await api.listChapters(bookPath);
    const meta = await api.getBookMeta(bookPath);
    set({ chapters, bookMeta: meta });
    if (get().selectedType === 'chapter' && get().selectedId === id) {
      get().clearSelection();
    }
  },

  deleteCharacter: async (id) => {
    const { bookPath } = get();
    if (!bookPath) return;
    await api.deleteCharacter(bookPath, id);
    const characters = await api.listCharacters(bookPath);
    set({ characters });
    if (get().selectedType === 'character' && get().selectedId === id) {
      get().clearSelection();
    }
  },

  addRelation: async (relatedId, relationType, description) => {
    const { bookPath, characterDraft } = get();
    if (!bookPath || !characterDraft) return;
    await api.addRelation(bookPath, characterDraft.id, relatedId, relationType, description);
    const relations = await api.listRelations(bookPath, characterDraft.id);
    set({ relations });
  },

  updateRelation: async (relationId, relationType, description) => {
    const { bookPath, characterDraft } = get();
    if (!bookPath || !characterDraft) return;
    await api.updateRelation(bookPath, relationId, relationType, description);
    const relations = await api.listRelations(bookPath, characterDraft.id);
    set({ relations });
  },

  deleteRelation: async (relationId) => {
    const { bookPath, characterDraft } = get();
    if (!bookPath || !characterDraft) return;
    await api.deleteRelation(bookPath, relationId);
    const relations = await api.listRelations(bookPath, characterDraft.id);
    set({ relations });
  },

  setError: (msg) => set({ error: msg }),
}));
