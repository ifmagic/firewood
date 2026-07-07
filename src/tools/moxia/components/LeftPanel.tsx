import { useMemo, useState } from 'react';
import { Dropdown, Input, message } from 'antd';
import type { MenuProps } from 'antd';
import { FileAddOutlined, UserAddOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/shallow';
import { useMoxiaStore } from '../store';
import type { ItemType } from '../types';
import ConfirmPopup from './ConfirmPopup';
import AddCharacterPopup from '../dialogs/AddCharacterPopup';
import styles from '../Moxia.module.css';

interface FlatItem {
  key: string;
  display: string;
  itemType: ItemType | 'character_group';
  itemId: number;
  indent: number;
  isGroup?: boolean;
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
  const flatItems = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = [];
    // Single-book file model: the left panel only shows the current book's contents.
    // Top level: book node
    // Chapters: indent 1
    // Character group: indent 1, expandable
    // Characters: indent 2
    items.push({
      key: 'book',
      display: '📖 ' + (bookMeta?.title || t('moxia.book')),
      itemType: 'book',
      itemId: 0,
      indent: 0,
    });

    if (searchKeyword.trim()) {
      // Search mode: only show matching chapters.
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
          display: `📄 ${c.title}`,
          itemType: 'chapter',
          itemId: c.id,
          indent: 1,
        });
      }
      return items;
    }

    // Chapters section
    for (const c of chapters) {
      items.push({
        key: `chapter-${c.id}`,
        display: `📄 ${c.title}`,
        itemType: 'chapter',
        itemId: c.id,
        indent: 1,
      });
    }

    // Character group
    const expanded = expandedGroups.has(0);
    items.push({
      key: 'character_group',
      display: `👥 ${t('moxia.characters')} (${characters.length})`,
      itemType: 'character_group',
      itemId: 0,
      indent: 1,
      isGroup: true,
    });

    if (expanded) {
      for (const c of characters) {
        items.push({
          key: `character-${c.id}`,
          display: `👤 ${c.name}`,
          itemType: 'character',
          itemId: c.id,
          indent: 2,
        });
      }
    }

    return items;
  }, [bookMeta, chapters, characters, searchKeyword, expandedGroups, t]);

  const handleClick = (item: FlatItem) => {
    if (item.isGroup) {
      toggleGroup(0);
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
    const nextNum = chapters.length + 1;
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
              onClick={() => handleClick(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClick(item);
                }
              }}
            >
              {item.isGroup && <span className={styles.navGroupToggle}>{expandedGroups.has(0) ? '▾' : '▸'}</span>}
              <span className={styles.navItemText}>{item.display}</span>
              {item.itemType === 'book' && (
                <span className={styles.navItemActions}>
                  <button
                    className={styles.navItemActionBtn}
                    title={t('moxia.addChapter')}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleAddChapter();
                    }}
                  >
                    <FileAddOutlined />
                  </button>
                  <button
                    className={styles.navItemActionBtn}
                    title={t('moxia.addCharacter')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddCharacterOpen(true);
                    }}
                  >
                    <UserAddOutlined />
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
