import { useMemo, useState, type ReactNode } from 'react';
import { Dropdown, Input, message } from 'antd';
import type { MenuProps } from 'antd';
import {
  FileAddOutlined,
  UserAddOutlined,
  BookOutlined,
  FileTextOutlined,
  UserOutlined,
  TeamOutlined,
  ReadOutlined,
  CaretRightOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/shallow';
import { useMoxiaStore } from '../store';
import type { ItemType } from '../types';
import type { NavGroupId } from '../store';
import ConfirmPopup from './ConfirmPopup';
import AddCharacterPopup from '../dialogs/AddCharacterPopup';
import styles from '../Moxia.module.css';

interface FlatItem {
  key: string;
  display: string;
  /** Optional leading icon (replaces legacy emoji baked into `display`). */
  icon?: ReactNode;
  itemType: ItemType | 'character_group' | 'chapter_group';
  itemId: number;
  indent: number;
  isGroup?: boolean;
  /** Which nav folder this item represents (only set when isGroup=true). */
  groupId?: NavGroupId;
}

interface PendingDelete {
  type: 'chapter' | 'character';
  id: number;
}

export default function LeftPanel() {
  const { t } = useTranslation();
  const {
    bookMeta,
    chapters,
    characters,
    selectedType,
    selectedId,
    searchKeyword,
    expandedGroups,
    selectBook,
    selectChapter,
    selectCharacter,
    setSearchKeyword,
    toggleGroup,
    addChapter,
    addCharacter,
    deleteChapter,
    deleteCharacter,
  } = useMoxiaStore(
    useShallow((s) => ({
      bookMeta: s.bookMeta,
      chapters: s.chapters,
      characters: s.characters,
      selectedType: s.selectedType,
      selectedId: s.selectedId,
      searchKeyword: s.searchKeyword,
      expandedGroups: s.expandedGroups,
      selectBook: s.selectBook,
      selectChapter: s.selectChapter,
      selectCharacter: s.selectCharacter,
      setSearchKeyword: s.setSearchKeyword,
      toggleGroup: s.toggleGroup,
      addChapter: s.addChapter,
      addCharacter: s.addCharacter,
      deleteChapter: s.deleteChapter,
      deleteCharacter: s.deleteCharacter,
    })),
  );

  const [addCharacterOpen, setAddCharacterOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  // Build the flat navigation list.
  // Single-book file model: top level = book node, then two sibling folders
  // (角色 / 正文管理), each expandable to reveal its children at indent 1.
  const flatItems = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = [];

    // Top: book node (click → book overview page).
    items.push({
      key: 'book',
      display: bookMeta?.title || t('moxia.book'),
      icon: <BookOutlined />,
      itemType: 'book',
      itemId: 0,
      indent: 0,
    });

    if (searchKeyword.trim()) {
      // Search mode: only show matching chapters, flat (no folder headers).
      const kw = searchKeyword.toLowerCase();
      const matched = chapters.filter(
        (c) =>
          c.title.toLowerCase().includes(kw) ||
          // Full-text search would need backend support; for now match titles only.
          false,
      );
      for (const c of matched) {
        items.push({
          key: `chapter-${c.id}`,
          display: c.title,
          icon: <FileTextOutlined />,
          itemType: 'chapter',
          itemId: c.id,
          indent: 1,
        });
      }
      return items;
    }

    // Character folder (top-level, groupId 0).
    items.push({
      key: 'character_group',
      display: `${t('moxia.characters')} (${characters.length})`,
      icon: <TeamOutlined />,
      itemType: 'character_group',
      itemId: 0,
      indent: 0,
      isGroup: true,
      groupId: 'character',
    });
    if (expandedGroups.has('character')) {
      for (const c of characters) {
        items.push({
          key: `character-${c.id}`,
          display: c.name,
          icon: <UserOutlined />,
          itemType: 'character',
          itemId: c.id,
          indent: 1,
        });
      }
    }

    // Chapter folder (top-level, groupId 1).
    items.push({
      key: 'chapter_group',
      display: `${t('moxia.chapterGroup')} (${chapters.length})`,
      icon: <ReadOutlined />,
      itemType: 'chapter_group',
      itemId: 0,
      indent: 0,
      isGroup: true,
      groupId: 'chapter',
    });
    if (expandedGroups.has('chapter')) {
      for (const c of chapters) {
        items.push({
          key: `chapter-${c.id}`,
          display: c.title,
          icon: <FileTextOutlined />,
          itemType: 'chapter',
          itemId: c.id,
          indent: 1,
        });
      }
    }

    return items;
  }, [bookMeta, chapters, characters, searchKeyword, expandedGroups, t]);

  const handleClick = (item: FlatItem) => {
    if (item.isGroup) {
      toggleGroup(item.groupId!);
      return;
    }
    if (item.itemType === 'book') {
      void selectBook();
    } else if (item.itemType === 'chapter') {
      void selectChapter(item.itemId);
    } else if (item.itemType === 'character') {
      void selectCharacter(item.itemId);
    }
  };

  const handleAddChapter = async () => {
    // Use the max existing chapter number (parsed from "第N章" titles) + 1 to avoid
    // collisions when chapters have been deleted. Falls back to count + 1.
    const existingNumbers = chapters
      .map((c) => {
        const m = c.title.match(/^第(\d+)章/);
        return m ? Number(m[1]) : 0;
      })
      .filter((n) => Number.isFinite(n));
    const nextNum = (existingNumbers.length ? Math.max(...existingNumbers) : 0) + 1;
    const title = `第${nextNum}章`;
    try {
      await addChapter(title);
    } catch (e) {
      void message.error(String(e));
    }
  };

  const handleAddCharacterSubmit = async (name: string, roleType: string) => {
    try {
      await addCharacter(name, roleType);
      setAddCharacterOpen(false);
    } catch (e) {
      void message.error(String(e));
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const { type, id } = pendingDelete;
    setPendingDelete(null);
    try {
      if (type === 'chapter') {
        await deleteChapter(id);
      } else {
        await deleteCharacter(id);
      }
    } catch (e) {
      void message.error(String(e));
    }
  };

  const contextMenuItems = (item: FlatItem): MenuProps['items'] => {
    if (item.itemType === 'chapter') {
      return [
        {
          key: 'delete',
          label: t('moxia.delete'),
          danger: true,
          onClick: () => setPendingDelete({ type: 'chapter', id: item.itemId }),
        },
      ];
    }
    if (item.itemType === 'character') {
      return [
        {
          key: 'delete',
          label: t('moxia.delete'),
          danger: true,
          onClick: () => setPendingDelete({ type: 'character', id: item.itemId }),
        },
      ];
    }
    return [];
  };

  return (
    <div className={styles.leftPanel}>
      <div className={styles.leftSearch}>
        <Input
          placeholder={t('moxia.searchPlaceholder')}
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          allowClear
          size="small"
        />
      </div>

      <div className={styles.navList}>
        {flatItems.map((item) => {
          const isSelected =
            (item.itemType === 'book' && selectedType === 'book') ||
            (item.itemType === 'chapter' && selectedType === 'chapter' && selectedId === item.itemId) ||
            (item.itemType === 'character' && selectedType === 'character' && selectedId === item.itemId);

          const content = (
            <div
              key={item.key}
              className={`${styles.navItem} ${isSelected ? styles.navItemSelected : ''}`}
              style={{ paddingLeft: 12 + item.indent * 20 }}
              role="button"
              tabIndex={0}
              aria-current={isSelected ? 'page' : undefined}
              aria-expanded={item.isGroup ? expandedGroups.has(item.groupId!) : undefined}
              onClick={() => handleClick(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClick(item);
                }
              }}
            >
              {item.isGroup && (
                <span className={styles.navGroupToggle}>
                  <CaretRightOutlined rotate={expandedGroups.has(item.groupId!) ? 90 : 0} />
                </span>
              )}
              {item.icon && <span className={styles.navItemIcon}>{item.icon}</span>}
              <span className={styles.navItemText}>{item.display}</span>
              {item.itemType === 'character_group' && (
                <span className={styles.navItemActions}>
                  <button
                    className={styles.navItemActionBtn}
                    title={t('moxia.addCharacter')}
                    aria-label={t('moxia.addCharacter')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddCharacterOpen(true);
                    }}
                  >
                    <UserAddOutlined />
                  </button>
                </span>
              )}
              {item.itemType === 'chapter_group' && (
                <span className={styles.navItemActions}>
                  <button
                    className={styles.navItemActionBtn}
                    title={t('moxia.addChapter')}
                    aria-label={t('moxia.addChapter')}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleAddChapter();
                    }}
                  >
                    <FileAddOutlined />
                  </button>
                </span>
              )}
            </div>
          );

          if (item.itemType === 'chapter' || item.itemType === 'character') {
            return (
              <Dropdown key={item.key} menu={{ items: contextMenuItems(item) }} trigger={['contextMenu']}>
                {content}
              </Dropdown>
            );
          }
          return content;
        })}
      </div>

      <AddCharacterPopup
        open={addCharacterOpen}
        onAdd={handleAddCharacterSubmit}
        onCancel={() => setAddCharacterOpen(false)}
      />

      <ConfirmPopup
        open={pendingDelete !== null}
        title={t('moxia.delete')}
        message={
          pendingDelete?.type === 'character' ? t('moxia.deleteCharacterConfirm') : t('moxia.deleteChapterConfirm')
        }
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
