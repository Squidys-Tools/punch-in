use crate::store::{format_duration, load, save, Active, Session};
use chrono::Local;

pub const DEFAULT_PROJECT: &str = "general";

pub fn start(project: Option<&str>) -> Result<String, String> {
    let project = project.unwrap_or(DEFAULT_PROJECT);
    let mut store = load()?;
    if store.active.is_some() {
        return Err(format!("a session is already running for '{}'", store.active.as_ref().unwrap().project));
    }
    store.active = Some(Active {
        project: project.to_string(),
        started_at: Local::now(),
    });
    save(&store)?;
    Ok(format!("started tracking '{}'", project))
}

pub fn stop() -> Result<String, String> {
    let mut store = load()?;
    let active = store
        .active
        .take()
        .ok_or_else(|| "no session is currently running".to_string())?;
    let ended_at = Local::now();
    let duration_secs = (ended_at - active.started_at).num_seconds().max(0) as u64;
    let project = active.project.clone();
    store.history.push(Session {
        project: active.project,
        started_at: active.started_at,
        ended_at,
        duration_secs,
    });
    save(&store)?;
    Ok(format!("stopped '{}' after {}", project, format_duration(duration_secs)))
}

pub fn status() -> Result<String, String> {
    let store = load()?;
    match &store.active {
        Some(active) => {
            let elapsed = (Local::now() - active.started_at).num_seconds().max(0) as u64;
            Ok(format!(
                "tracking '{}' for {}",
                active.project,
                format_duration(elapsed)
            ))
        }
        None => Ok("no session is running".to_string()),
    }
}
