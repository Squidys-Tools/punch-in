use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Active {
    pub project: String,
    pub started_at: DateTime<Local>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub project: String,
    pub started_at: DateTime<Local>,
    pub ended_at: DateTime<Local>,
    pub duration_secs: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Store {
    pub active: Option<Active>,
    pub history: Vec<Session>,
}

pub fn data_file() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("punch")
        .join("punch.json")
}

pub fn load() -> Result<Store, String> {
    let path = data_file();
    if !path.exists() {
        return Ok(Store::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("failed to read {}: {e}", path.display()))?;
    serde_json::from_str(&raw).map_err(|e| format!("corrupt data file {}: {e}", path.display()))
}

pub fn save(store: &Store) -> Result<(), String> {
    let path = data_file();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("failed to create {}: {e}", parent.display()))?;
    }
    let raw = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| format!("failed to write {}: {e}", path.display()))
}

pub fn format_duration(secs: u64) -> String {
    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    if h > 0 {
        format!("{h}h {m:02}m {s:02}s")
    } else if m > 0 {
        format!("{m}m {s:02}s")
    } else {
        format!("{s}s")
    }
}

pub fn today_sessions(history: &[Session]) -> Vec<&Session> {
    let today = Local::now().date_naive();
    history
        .iter()
        .filter(|s| s.started_at.date_naive() == today)
        .collect()
}

pub fn total_on(history: &[Session], date: chrono::NaiveDate) -> u64 {
    history
        .iter()
        .filter(|s| s.started_at.date_naive() == date)
        .map(|s| s.duration_secs)
        .sum()
}
