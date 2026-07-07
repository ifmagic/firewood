use std::collections::HashMap;
use std::sync::Arc;

use tauri::State;

use super::dto::*;
use super::MoxiaManager;

// ============ Book ============

#[tauri::command]
pub fn moxia_create_book(
    manager: State<'_, Arc<MoxiaManager>>,
    path: String,
    title: String,
    genre: String,
) -> Result<BookInfo, String> {
    manager.create_book(&path, &title, &genre)
}

#[tauri::command]
pub fn moxia_open_book(
    manager: State<'_, Arc<MoxiaManager>>,
    path: String,
) -> Result<BookInfo, String> {
    manager.open_book(&path)
}

#[tauri::command]
pub fn moxia_close_book(manager: State<'_, Arc<MoxiaManager>>, path: String) -> Result<(), String> {
    manager.close_book(&path)
}

#[tauri::command]
pub fn moxia_get_book_meta(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
) -> Result<BookMeta, String> {
    manager.get_book_meta(&book_path)
}

#[tauri::command]
pub fn moxia_update_book_meta(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
    fields: HashMap<String, String>,
) -> Result<(), String> {
    manager.update_book_meta(&book_path, fields)
}

// ============ Chapter ============

#[tauri::command]
pub fn moxia_list_chapters(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
) -> Result<Vec<ChapterSummary>, String> {
    manager.list_chapters(&book_path)
}

#[tauri::command]
pub fn moxia_get_chapter(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
    id: i64,
) -> Result<Chapter, String> {
    manager.get_chapter(&book_path, id)
}

#[tauri::command]
pub fn moxia_create_chapter(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
    title: String,
    sort_order: i64,
) -> Result<Chapter, String> {
    manager.create_chapter(&book_path, &title, sort_order)
}

#[tauri::command]
pub fn moxia_update_chapter(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
    id: i64,
    fields: HashMap<String, String>,
) -> Result<(), String> {
    manager.update_chapter(&book_path, id, fields)
}

#[tauri::command]
pub fn moxia_delete_chapter(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
    id: i64,
) -> Result<(), String> {
    manager.delete_chapter(&book_path, id)
}

#[tauri::command]
pub fn moxia_reorder_chapters(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
    chapter_ids: Vec<i64>,
) -> Result<(), String> {
    manager.reorder_chapters(&book_path, chapter_ids)
}

#[tauri::command]
pub fn moxia_get_next_chapter_sort_order(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
) -> Result<i64, String> {
    manager.get_next_chapter_sort_order(&book_path)
}

// ============ Character ============

#[tauri::command]
pub fn moxia_list_characters(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
) -> Result<Vec<CharacterSummary>, String> {
    manager.list_characters(&book_path)
}

#[tauri::command]
pub fn moxia_get_character(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
    id: i64,
) -> Result<Character, String> {
    manager.get_character(&book_path, id)
}

#[tauri::command]
pub fn moxia_create_character(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
    name: String,
    role_type: String,
) -> Result<Character, String> {
    manager.create_character(&book_path, &name, &role_type)
}

#[tauri::command]
pub fn moxia_update_character(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
    id: i64,
    fields: HashMap<String, String>,
) -> Result<(), String> {
    manager.update_character(&book_path, id, fields)
}

#[tauri::command]
pub fn moxia_delete_character(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
    id: i64,
) -> Result<(), String> {
    manager.delete_character(&book_path, id)
}

// ============ CharacterRelation ============

#[tauri::command]
pub fn moxia_list_relations(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
    character_id: i64,
) -> Result<Vec<CharacterRelation>, String> {
    manager.list_relations(&book_path, character_id)
}

#[tauri::command]
pub fn moxia_add_relation(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
    character_id: i64,
    related_id: i64,
    relation_type: String,
    description: String,
) -> Result<CharacterRelation, String> {
    manager.add_relation(
        &book_path,
        character_id,
        related_id,
        &relation_type,
        &description,
    )
}

#[tauri::command]
pub fn moxia_update_relation(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
    relation_id: i64,
    relation_type: String,
    description: String,
) -> Result<(), String> {
    manager.update_relation(&book_path, relation_id, &relation_type, &description)
}

#[tauri::command]
pub fn moxia_delete_relation(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
    relation_id: i64,
) -> Result<(), String> {
    manager.delete_relation(&book_path, relation_id)
}

// ============ Settings ============

#[tauri::command]
pub fn moxia_get_setting(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
    key: String,
) -> Result<Option<String>, String> {
    manager.get_setting(&book_path, &key)
}

#[tauri::command]
pub fn moxia_set_setting(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
    key: String,
    value: String,
) -> Result<(), String> {
    manager.set_setting(&book_path, &key, &value)
}

#[tauri::command]
pub fn moxia_get_all_settings(
    manager: State<'_, Arc<MoxiaManager>>,
    book_path: String,
) -> Result<HashMap<String, String>, String> {
    manager.get_all_settings(&book_path)
}
