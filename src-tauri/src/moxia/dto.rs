use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookInfo {
    pub path: String,
    pub title: String,
    pub genre: String,
    pub status: String,
    pub description: String,
    pub worldbuilding: String,
    pub word_count: i64,
    pub chapter_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookMeta {
    pub title: String,
    pub genre: String,
    pub status: String,
    pub description: String,
    pub worldbuilding: String,
    pub word_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub sort_order: i64,
    pub word_count: i64,
    pub status: String,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterSummary {
    pub id: i64,
    pub title: String,
    pub sort_order: i64,
    pub word_count: i64,
    pub status: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Character {
    pub id: i64,
    pub name: String,
    pub role_type: String,
    pub description: String,
    pub personality: String,
    pub background: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterSummary {
    pub id: i64,
    pub name: String,
    pub role_type: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterRelation {
    pub id: i64,
    pub character_id: i64,
    pub related_id: i64,
    pub related_name: String,
    pub relation_type: String,
    pub description: String,
    pub created_at: String,
    pub updated_at: String,
}
