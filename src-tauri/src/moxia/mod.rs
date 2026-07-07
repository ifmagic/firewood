use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

pub mod commands;
pub mod dto;
pub mod migration;

use dto::*;

/// Manages SQLite connections for multiple .moxia files. One file per book, one connection per file.
/// Mirrors the `pty::PtyManager` pattern: hides the Mutex inside the struct, exposes only `&self` methods.
pub struct MoxiaManager {
    connections: Mutex<HashMap<PathBuf, Connection>>,
}

impl MoxiaManager {
    pub fn new() -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
        }
    }

    /// Validates the file extension and canonicalizes the path, preventing different path
    /// representations of the same file (e.g. `./foo.moxia` vs `foo.moxia`) from creating
    /// duplicate keys in the connection pool.
    fn validate_path(path: &str) -> Result<PathBuf, String> {
        if !path.ends_with(".moxia") && !path.ends_with(".sqlite") && !path.ends_with(".db") {
            return Err(format!(
                "only .moxia/.sqlite/.db files are allowed, got: {}",
                path
            ));
        }
        let raw = PathBuf::from(path);
        // Canonicalize the full path if the file already exists; otherwise (new book) canonicalize
        // the parent directory and re-append the file name.
        let canonical = if raw.exists() {
            std::fs::canonicalize(&raw).unwrap_or(raw)
        } else if let Some(parent) = raw.parent() {
            if parent.exists() {
                std::fs::canonicalize(parent)
                    .ok()
                    .map(|c| c.join(raw.file_name().unwrap_or_default()))
                    .unwrap_or(raw)
            } else {
                raw
            }
        } else {
            raw
        };
        Ok(canonical)
    }

    /// Applies connection-level PRAGMAs. SQLite defaults foreign keys to OFF, so each connection
    /// must enable them explicitly for `character_relations` ON DELETE CASCADE to take effect.
    fn init_pragmas(conn: &Connection) -> Result<(), String> {
        conn.execute_batch("PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("set PRAGMA foreign_keys=ON failed: {}", e))?;
        Ok(())
    }

    /// Helper that borrows an open connection from the pool. The callback runs inside the lock
    /// to avoid double-locking.
    fn with_conn<F, T>(&self, path: &str, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        let p = Self::validate_path(path)?;
        let conns = self.connections.lock();
        let conn = conns.get(&p).ok_or_else(|| "book not opened".to_string())?;
        f(conn)
    }

    /// Creates a new book file. Opens the connection, runs migrations, and writes the meta row.
    pub fn create_book(&self, path: &str, title: &str, genre: &str) -> Result<BookInfo, String> {
        let p = Self::validate_path(path)?;
        if p.exists() {
            return Err(format!("file already exists: {}", path));
        }
        let conn = Connection::open(&p).map_err(|e| format!("open sqlite failed: {}", e))?;
        Self::init_pragmas(&conn)?;
        migration::run(&conn)?;
        let now = migration::now();
        // Wrap all meta writes in a transaction to guarantee no half-initialized file.
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("begin tx failed: {}", e))?;
        for (k, v) in [
            ("title", title),
            ("genre", genre),
            ("status", "draft"),
            ("word_count", "0"),
            ("created_at", &now),
            ("updated_at", &now),
        ] {
            tx.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                params![k, v],
            )
            .map_err(|e| format!("write meta {} failed: {}", k, e))?;
        }
        tx.commit()
            .map_err(|e| format!("commit create_book failed: {}", e))?;

        let info = self.read_book_info_from(&conn, path);
        {
            let mut conns = self.connections.lock();
            conns.insert(p, conn);
        }
        info
    }

    /// Opens an existing book file. Migrations are idempotent.
    pub fn open_book(&self, path: &str) -> Result<BookInfo, String> {
        let p = Self::validate_path(path)?;
        if !p.exists() {
            return Err(format!("file not found: {}", path));
        }
        let mut conns = self.connections.lock();
        if !conns.contains_key(&p) {
            let conn = Connection::open(&p).map_err(|e| format!("open sqlite failed: {}", e))?;
            Self::init_pragmas(&conn)?;
            migration::run(&conn)?;
            conns.insert(p.clone(), conn);
        }
        let conn = conns.get(&p).unwrap();
        self.read_book_info_from(conn, path)
    }

    /// Closes the connection for the given book (dropping the handle closes SQLite).
    pub fn close_book(&self, path: &str) -> Result<(), String> {
        let p = Self::validate_path(path)?;
        let mut conns = self.connections.lock();
        conns.remove(&p);
        Ok(())
    }

    /// Closes all connections (called on application exit).
    pub fn close_all(&self) {
        let mut conns = self.connections.lock();
        conns.clear();
    }

    fn read_meta(conn: &Connection, key: &str) -> String {
        conn.query_row("SELECT value FROM meta WHERE key=?", params![key], |r| {
            r.get::<_, String>(0)
        })
        .unwrap_or_default()
    }

    /// Computes `SUM(word_count)` live from the `chapters` table rather than reading the meta cache
    /// (meta is TEXT; `.parse()` would silently zero out on corruption).
    fn read_word_count(conn: &Connection) -> i64 {
        conn.query_row(
            "SELECT COALESCE(SUM(word_count), 0) FROM chapters",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0)
    }

    fn read_book_info_from(&self, conn: &Connection, path: &str) -> Result<BookInfo, String> {
        let title = Self::read_meta(conn, "title");
        let genre = Self::read_meta(conn, "genre");
        let status = Self::read_meta(conn, "status");
        let description = Self::read_meta(conn, "description");
        let worldbuilding = Self::read_meta(conn, "worldbuilding");
        let word_count = Self::read_word_count(conn);
        let created_at = Self::read_meta(conn, "created_at");
        let updated_at = Self::read_meta(conn, "updated_at");
        let chapter_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM chapters", [], |r| r.get(0))
            .map_err(|e| format!("count chapters failed: {}", e))?;
        Ok(BookInfo {
            path: path.to_string(),
            title,
            genre,
            status,
            description,
            worldbuilding,
            word_count,
            chapter_count,
            created_at,
            updated_at,
        })
    }

    pub fn get_book_meta(&self, path: &str) -> Result<BookMeta, String> {
        self.with_conn(path, |conn| {
            Ok(BookMeta {
                title: Self::read_meta(conn, "title"),
                genre: Self::read_meta(conn, "genre"),
                status: Self::read_meta(conn, "status"),
                description: Self::read_meta(conn, "description"),
                worldbuilding: Self::read_meta(conn, "worldbuilding"),
                word_count: Self::read_word_count(conn),
                created_at: Self::read_meta(conn, "created_at"),
                updated_at: Self::read_meta(conn, "updated_at"),
            })
        })
    }

    pub fn update_book_meta(
        &self,
        path: &str,
        fields: HashMap<String, String>,
    ) -> Result<(), String> {
        let allowed = [
            "title",
            "genre",
            "status",
            "description",
            "worldbuilding",
            "word_count",
        ];
        // Validate all keys before writing — avoids the case where the 1st field is committed
        // but the 2nd is invalid and roll-back is difficult.
        for k in fields.keys() {
            if !allowed.contains(&k.as_str()) {
                return Err(format!("invalid meta key: {}", k));
            }
        }
        self.with_conn(path, |conn| {
            let now = migration::now();
            let tx = conn
                .unchecked_transaction()
                .map_err(|e| format!("begin tx failed: {}", e))?;
            for (k, v) in &fields {
                tx.execute(
                    "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                    params![k, v],
                )
                .map_err(|e| format!("update meta {} failed: {}", k, e))?;
            }
            tx.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                params!["updated_at", &now],
            )
            .map_err(|e| format!("update meta updated_at failed: {}", e))?;
            tx.commit()
                .map_err(|e| format!("commit update_book_meta failed: {}", e))?;
            Ok(())
        })
    }

    // ============ Chapter ============

    pub fn list_chapters(&self, path: &str) -> Result<Vec<ChapterSummary>, String> {
        self.with_conn(path, |conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT id, title, sort_order, word_count, status, updated_at
                     FROM chapters ORDER BY sort_order",
                )
                .map_err(|e| format!("prepare chapters failed: {}", e))?;
            let rows = stmt
                .query_map([], |r| {
                    Ok(ChapterSummary {
                        id: r.get(0)?,
                        title: r.get(1)?,
                        sort_order: r.get(2)?,
                        word_count: r.get(3)?,
                        status: r.get(4)?,
                        updated_at: r.get(5)?,
                    })
                })
                .map_err(|e| format!("query chapters failed: {}", e))?;
            let mut out = Vec::new();
            for row in rows {
                out.push(row.map_err(|e| format!("row chapters failed: {}", e))?);
            }
            Ok(out)
        })
    }

    pub fn get_chapter(&self, path: &str, id: i64) -> Result<Chapter, String> {
        self.with_conn(path, |conn| self.get_chapter_inner(conn, id))
    }

    pub fn create_chapter(
        &self,
        path: &str,
        title: &str,
        sort_order: i64,
    ) -> Result<Chapter, String> {
        let p = Self::validate_path(path)?;
        let conns = self.connections.lock();
        let conn = conns.get(&p).ok_or_else(|| "book not opened".to_string())?;
        let now = migration::now();
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("begin tx failed: {}", e))?;
        tx.execute(
            "INSERT INTO chapters (title, content, sort_order, word_count, status, notes, created_at, updated_at)
             VALUES (?, '', ?, 0, 'draft', '', ?, ?)",
            params![title, sort_order, &now, &now],
        )
        .map_err(|e| format!("insert chapter failed: {}", e))?;
        let id = tx.last_insert_rowid();
        self.touch_book_updated_at(&tx)?;
        tx.commit()
            .map_err(|e| format!("commit create_chapter failed: {}", e))?;
        self.get_chapter_inner(conn, id)
    }

    fn get_chapter_inner(&self, conn: &Connection, id: i64) -> Result<Chapter, String> {
        conn.query_row(
            "SELECT id, title, content, sort_order, word_count, status, notes, created_at, updated_at
             FROM chapters WHERE id=?",
            params![id],
            |r| {
                Ok(Chapter {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    content: r.get(2)?,
                    sort_order: r.get(3)?,
                    word_count: r.get(4)?,
                    status: r.get(5)?,
                    notes: r.get(6)?,
                    created_at: r.get(7)?,
                    updated_at: r.get(8)?,
                })
            },
        )
        .map_err(|e| format!("get chapter {} failed: {}", id, e))
    }

    pub fn update_chapter(
        &self,
        path: &str,
        id: i64,
        fields: HashMap<String, String>,
    ) -> Result<(), String> {
        let allowed = ["title", "content", "sort_order", "status", "notes"];
        // Validate all keys before writing
        for k in fields.keys() {
            if !allowed.contains(&k.as_str()) {
                return Err(format!("invalid chapter key: {}", k));
            }
        }
        let p = Self::validate_path(path)?;
        let conns = self.connections.lock();
        let conn = conns.get(&p).ok_or_else(|| "book not opened".to_string())?;

        let now = migration::now();
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("begin tx failed: {}", e))?;
        for (k, v) in &fields {
            let sql = match k.as_str() {
                "sort_order" => "UPDATE chapters SET sort_order=?, updated_at=? WHERE id=?",
                _ => &format!("UPDATE chapters SET {}=?, updated_at=? WHERE id=?", k),
            };
            tx.execute(sql, params![v, &now, id])
                .map_err(|e| format!("update chapter {} {} failed: {}", id, k, e))?;
        }

        // When content changes, recompute the chapter's word_count and refresh the book total.
        if let Some(content) = fields.get("content") {
            let wc = count_words(content);
            tx.execute(
                "UPDATE chapters SET word_count=?, updated_at=? WHERE id=?",
                params![wc, &now, id],
            )
            .map_err(|e| format!("update chapter word_count failed: {}", e))?;
            self.touch_book_updated_at(&tx)?;
        }
        tx.commit()
            .map_err(|e| format!("commit update_chapter failed: {}", e))?;
        Ok(())
    }

    pub fn delete_chapter(&self, path: &str, id: i64) -> Result<(), String> {
        let p = Self::validate_path(path)?;
        let conns = self.connections.lock();
        let conn = conns.get(&p).ok_or_else(|| "book not opened".to_string())?;
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("begin tx failed: {}", e))?;
        tx.execute("DELETE FROM chapters WHERE id=?", params![id])
            .map_err(|e| format!("delete chapter {} failed: {}", id, e))?;
        self.touch_book_updated_at(&tx)?;
        tx.commit()
            .map_err(|e| format!("commit delete_chapter failed: {}", e))?;
        Ok(())
    }

    pub fn reorder_chapters(&self, path: &str, chapter_ids: Vec<i64>) -> Result<(), String> {
        let p = Self::validate_path(path)?;
        let conns = self.connections.lock();
        let conn = conns.get(&p).ok_or_else(|| "book not opened".to_string())?;
        let now = migration::now();
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("begin tx failed: {}", e))?;
        for (order, cid) in chapter_ids.iter().enumerate() {
            tx.execute(
                "UPDATE chapters SET sort_order=?, updated_at=? WHERE id=?",
                params![order as i64, &now, cid],
            )
            .map_err(|e| format!("reorder chapter {} failed: {}", cid, e))?;
        }
        tx.commit()
            .map_err(|e| format!("commit reorder_chapters failed: {}", e))?;
        Ok(())
    }

    pub fn get_next_chapter_sort_order(&self, path: &str) -> Result<i64, String> {
        self.with_conn(path, |conn| {
            // MAX returns NULL on an empty table; `r.get(0)` reading i64 would fail
            // (Invalid column type Null). COALESCE falls back to -1, matching the SUM pattern.
            let max: i64 = conn
                .query_row(
                    "SELECT COALESCE(MAX(sort_order), -1) FROM chapters",
                    [],
                    |r| r.get(0),
                )
                .map_err(|e| format!("query max sort_order failed: {}", e))?;
            Ok(max + 1)
        })
    }

    /// Updates the book's `updated_at` (word_count is no longer cached in meta; it is computed
    /// live via SUM on read).
    fn touch_book_updated_at(&self, conn: &Connection) -> Result<(), String> {
        let now = migration::now();
        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
            params!["updated_at", &now],
        )
        .map_err(|e| format!("update meta updated_at failed: {}", e))?;
        Ok(())
    }

    // ============ Character ============

    pub fn list_characters(&self, path: &str) -> Result<Vec<CharacterSummary>, String> {
        self.with_conn(path, |conn| {
            let mut stmt = conn
                .prepare("SELECT id, name, role_type, updated_at FROM characters ORDER BY id")
                .map_err(|e| format!("prepare characters failed: {}", e))?;
            let rows = stmt
                .query_map([], |r| {
                    Ok(CharacterSummary {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        role_type: r.get(2)?,
                        updated_at: r.get(3)?,
                    })
                })
                .map_err(|e| format!("query characters failed: {}", e))?;
            let mut out = Vec::new();
            for row in rows {
                out.push(row.map_err(|e| format!("row characters failed: {}", e))?);
            }
            Ok(out)
        })
    }

    pub fn get_character(&self, path: &str, id: i64) -> Result<Character, String> {
        self.with_conn(path, |conn| self.get_character_inner(conn, id))
    }

    pub fn create_character(
        &self,
        path: &str,
        name: &str,
        role_type: &str,
    ) -> Result<Character, String> {
        let p = Self::validate_path(path)?;
        let conns = self.connections.lock();
        let conn = conns.get(&p).ok_or_else(|| "book not opened".to_string())?;
        let now = migration::now();
        conn.execute(
            "INSERT INTO characters (name, role_type, description, personality, background, created_at, updated_at)
             VALUES (?, ?, '', '', '', ?, ?)",
            params![name, role_type, &now, &now],
        )
        .map_err(|e| format!("insert character failed: {}", e))?;
        let id = conn.last_insert_rowid();
        self.get_character_inner(conn, id)
    }

    fn get_character_inner(&self, conn: &Connection, id: i64) -> Result<Character, String> {
        conn.query_row(
            "SELECT id, name, role_type, description, personality, background, created_at, updated_at
             FROM characters WHERE id=?",
            params![id],
            |r| {
                Ok(Character {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    role_type: r.get(2)?,
                    description: r.get(3)?,
                    personality: r.get(4)?,
                    background: r.get(5)?,
                    created_at: r.get(6)?,
                    updated_at: r.get(7)?,
                })
            },
        )
        .map_err(|e| format!("get character {} failed: {}", id, e))
    }

    pub fn update_character(
        &self,
        path: &str,
        id: i64,
        fields: HashMap<String, String>,
    ) -> Result<(), String> {
        let allowed = [
            "name",
            "role_type",
            "description",
            "personality",
            "background",
        ];
        for k in fields.keys() {
            if !allowed.contains(&k.as_str()) {
                return Err(format!("invalid character key: {}", k));
            }
        }
        self.with_conn(path, |conn| {
            let now = migration::now();
            let tx = conn
                .unchecked_transaction()
                .map_err(|e| format!("begin tx failed: {}", e))?;
            for (k, v) in &fields {
                let sql = format!("UPDATE characters SET {}=?, updated_at=? WHERE id=?", k);
                tx.execute(&sql, params![v, &now, id])
                    .map_err(|e| format!("update character {} {} failed: {}", id, k, e))?;
            }
            tx.commit()
                .map_err(|e| format!("commit update_character failed: {}", e))?;
            Ok(())
        })
    }

    pub fn delete_character(&self, path: &str, id: i64) -> Result<(), String> {
        self.with_conn(path, |conn| {
            conn.execute("DELETE FROM characters WHERE id=?", params![id])
                .map_err(|e| format!("delete character {} failed: {}", id, e))?;
            Ok(())
        })
    }

    // ============ CharacterRelation ============

    pub fn list_relations(
        &self,
        path: &str,
        character_id: i64,
    ) -> Result<Vec<CharacterRelation>, String> {
        self.with_conn(path, |conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT r.id, r.character_id, r.related_id, c.name AS related_name,
                            r.relation_type, r.description, r.created_at, r.updated_at
                     FROM character_relations r
                     JOIN characters c ON c.id = r.related_id
                     WHERE r.character_id=? OR r.related_id=?
                     ORDER BY r.id",
                )
                .map_err(|e| format!("prepare relations failed: {}", e))?;
            let rows = stmt
                .query_map(params![character_id, character_id], |r| {
                    Ok(CharacterRelation {
                        id: r.get(0)?,
                        character_id: r.get(1)?,
                        related_id: r.get(2)?,
                        related_name: r.get(3)?,
                        relation_type: r.get(4)?,
                        description: r.get(5)?,
                        created_at: r.get(6)?,
                        updated_at: r.get(7)?,
                    })
                })
                .map_err(|e| format!("query relations failed: {}", e))?;
            let mut out = Vec::new();
            for row in rows {
                out.push(row.map_err(|e| format!("row relations failed: {}", e))?);
            }
            Ok(out)
        })
    }

    pub fn add_relation(
        &self,
        path: &str,
        character_id: i64,
        related_id: i64,
        relation_type: &str,
        description: &str,
    ) -> Result<CharacterRelation, String> {
        let p = Self::validate_path(path)?;
        let conns = self.connections.lock();
        let conn = conns.get(&p).ok_or_else(|| "book not opened".to_string())?;
        if character_id == related_id {
            return Err("cannot relate character to itself".into());
        }
        let exists: Option<i64> = conn
            .query_row(
                "SELECT id FROM character_relations
                 WHERE character_id=? AND related_id=? AND relation_type=?",
                params![character_id, related_id, relation_type],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| format!("check duplicate relation failed: {}", e))?;
        if exists.is_some() {
            return Err("relation already exists".into());
        }
        let now = migration::now();
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("begin tx failed: {}", e))?;
        tx.execute(
            "INSERT INTO character_relations (character_id, related_id, relation_type, description, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)",
            params![character_id, related_id, relation_type, description, &now, &now],
        )
        .map_err(|e| format!("insert relation failed: {}", e))?;
        let id = tx.last_insert_rowid();
        let related_name: String = tx
            .query_row(
                "SELECT name FROM characters WHERE id=?",
                params![related_id],
                |r| r.get(0),
            )
            .map_err(|e| format!("get related name failed: {}", e))?;
        tx.commit()
            .map_err(|e| format!("commit add_relation failed: {}", e))?;
        Ok(CharacterRelation {
            id,
            character_id,
            related_id,
            related_name,
            relation_type: relation_type.to_string(),
            description: description.to_string(),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn update_relation(
        &self,
        path: &str,
        relation_id: i64,
        relation_type: &str,
        description: &str,
    ) -> Result<(), String> {
        self.with_conn(path, |conn| {
            let now = migration::now();
            conn.execute(
                "UPDATE character_relations SET relation_type=?, description=?, updated_at=? WHERE id=?",
                params![relation_type, description, &now, relation_id],
            )
            .map_err(|e| format!("update relation {} failed: {}", relation_id, e))?;
            Ok(())
        })
    }

    pub fn delete_relation(&self, path: &str, relation_id: i64) -> Result<(), String> {
        self.with_conn(path, |conn| {
            conn.execute(
                "DELETE FROM character_relations WHERE id=?",
                params![relation_id],
            )
            .map_err(|e| format!("delete relation {} failed: {}", relation_id, e))?;
            Ok(())
        })
    }

    // ============ Settings (per-book) ============

    pub fn get_setting(&self, path: &str, key: &str) -> Result<Option<String>, String> {
        self.with_conn(path, |conn| {
            let v: Option<String> = conn
                .query_row(
                    "SELECT value FROM settings WHERE key=?",
                    params![key],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| format!("get setting {} failed: {}", key, e))?;
            Ok(v)
        })
    }

    pub fn set_setting(&self, path: &str, key: &str, value: &str) -> Result<(), String> {
        self.with_conn(path, |conn| {
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                params![key, value],
            )
            .map_err(|e| format!("set setting {} failed: {}", key, e))?;
            Ok(())
        })
    }

    pub fn get_all_settings(&self, path: &str) -> Result<HashMap<String, String>, String> {
        self.with_conn(path, |conn| {
            let mut stmt = conn
                .prepare("SELECT key, value FROM settings")
                .map_err(|e| format!("prepare settings failed: {}", e))?;
            let rows = stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
                .map_err(|e| format!("query settings failed: {}", e))?;
            let mut out = HashMap::new();
            for row in rows {
                let (k, v) = row.map_err(|e| format!("row settings failed: {}", e))?;
                out.insert(k, v);
            }
            Ok(out)
        })
    }
}

/// CJK-friendly word count: counts non-whitespace characters.
/// Consistent with the original moxia project: `len(content.replace(" ", "").replace("\n", ""))`.
fn count_words(s: &str) -> i64 {
    let cleaned: String = s.chars().filter(|c| !c.is_whitespace()).collect();
    cleaned.chars().count() as i64
}

/// Factory function, mirrors `pty::create_pty_manager`.
pub fn create_moxia_manager() -> Arc<MoxiaManager> {
    Arc::new(MoxiaManager::new())
}
