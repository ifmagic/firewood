use rusqlite::Connection;

/// All known migrations, ordered by version number. Append new versions here as needed.
const MIGRATIONS: &[(i64, &str)] = &[
    (
        1,
        r#"
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version    INTEGER PRIMARY KEY,
            applied_at TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chapters (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            title      TEXT    NOT NULL,
            content    TEXT    NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            word_count INTEGER NOT NULL DEFAULT 0,
            status     TEXT    NOT NULL DEFAULT 'draft',
            notes      TEXT    NOT NULL DEFAULT '',
            created_at TEXT    NOT NULL,
            updated_at TEXT    NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_chapters_sort_order ON chapters(sort_order);

        CREATE TABLE IF NOT EXISTS characters (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            role_type   TEXT    NOT NULL DEFAULT '',
            description TEXT    NOT NULL DEFAULT '',
            personality TEXT    NOT NULL DEFAULT '',
            background  TEXT    NOT NULL DEFAULT '',
            created_at  TEXT    NOT NULL,
            updated_at  TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS character_relations (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id  INTEGER NOT NULL,
            related_id    INTEGER NOT NULL,
            relation_type TEXT    NOT NULL DEFAULT '',
            description   TEXT    NOT NULL DEFAULT '',
            created_at    TEXT    NOT NULL,
            updated_at    TEXT    NOT NULL,
            FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
            FOREIGN KEY (related_id)   REFERENCES characters(id) ON DELETE CASCADE,
            CHECK (character_id <> related_id)
        );
        CREATE INDEX IF NOT EXISTS idx_relations_character ON character_relations(character_id);
        CREATE INDEX IF NOT EXISTS idx_relations_related   ON character_relations(related_id);

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    ),
    (
        2,
        // Backfill the UNIQUE constraint on (character_id, related_id, relation_type).
        // SQLite does not support ALTER TABLE ADD CONSTRAINT, so use a CREATE UNIQUE INDEX.
        r#"
        CREATE UNIQUE INDEX IF NOT EXISTS idx_relations_unique
            ON character_relations(character_id, related_id, relation_type);
        "#,
    ),
];

fn now_iso() -> String {
    // Avoid depending on chrono; use std time to produce an RFC3339-ish UTC timestamp.
    // Second precision is sufficient for moxia's created_at / updated_at use cases.
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86400;
    let rem = secs % 86400;
    let h = rem / 3600;
    let m = (rem % 3600) / 60;
    let s = rem % 60;
    // Convert days since 1970-01-01 to a proleptic Gregorian date.
    let (y, mo, d) = days_to_ymd(days as i64);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}Z")
}

/// Converts days since 1970-01-01 to a proleptic Gregorian year/month/day.
/// Algorithm adapted from Howard Hinnant's date library.
fn days_to_ymd(days: i64) -> (i64, i64, i64) {
    let z = days + 719468;
    let era = if z >= 0 {
        z / 146097
    } else {
        (z - 146096) / 146097
    };
    let doe = z - era * 146097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    (if m <= 2 { y + 1 } else { y }, m, d)
}

pub fn now() -> String {
    now_iso()
}

/// Runs all unapplied migrations. Idempotent: applied versions are skipped.
pub fn run(conn: &Connection) -> Result<(), String> {
    // Ensure the schema_migrations table exists (migration 1 would create it, but the runner
    // itself needs the table before it can query applied versions on first run). Using
    // CREATE IF NOT EXISTS here duplicates migration 1's statement but is SQL-idempotent.
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version    INTEGER PRIMARY KEY,
            applied_at TEXT    NOT NULL
        );",
    )
    .map_err(|e| format!("create schema_migrations failed: {}", e))?;

    let mut applied: std::collections::HashSet<i64> = std::collections::HashSet::new();
    let mut stmt = conn
        .prepare("SELECT version FROM schema_migrations")
        .map_err(|e| format!("prepare migrations failed: {}", e))?;
    let rows = stmt
        .query_map([], |r| r.get::<_, i64>(0))
        .map_err(|e| format!("query migrations failed: {}", e))?;
    for row in rows {
        applied.insert(row.map_err(|e| format!("row migrations failed: {}", e))?);
    }

    for (version, sql) in MIGRATIONS {
        if applied.contains(version) {
            continue;
        }
        // Each migration runs in its own transaction so a failure rolls back to the previous
        // version without leaving a half-applied schema.
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("begin tx for migration v{} failed: {}", version, e))?;
        tx.execute_batch(sql)
            .map_err(|e| format!("migration v{} failed: {}", version, e))?;
        tx.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
            rusqlite::params![version, now_iso()],
        )
        .map_err(|e| format!("record migration v{} failed: {}", version, e))?;
        tx.commit()
            .map_err(|e| format!("commit migration v{} failed: {}", version, e))?;
    }
    Ok(())
}
