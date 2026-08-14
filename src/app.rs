use crate::commands;
use crate::store::{self, Store};
use chrono::Local;
use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind};
use ratatui::{
    layout::{Alignment, Constraint, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame,
};
use std::time::Duration;

#[derive(Clone, Copy, PartialEq)]
enum Mode {
    Normal,
    Input,
}

#[derive(Clone, Copy, PartialEq)]
enum Design {
    Minimal,
    TodayLine,
    SessionList,
    GoalRing,
}

impl Design {
    fn name(self) -> &'static str {
        match self {
            Design::Minimal => "minimal",
            Design::TodayLine => "today-line",
            Design::SessionList => "session-list",
            Design::GoalRing => "goal-ring",
        }
    }

    fn next(self) -> Design {
        match self {
            Design::Minimal => Design::TodayLine,
            Design::TodayLine => Design::SessionList,
            Design::SessionList => Design::GoalRing,
            Design::GoalRing => Design::Minimal,
        }
    }
}

struct StatusMsg {
    text: String,
    is_error: bool,
}

struct App {
    store: Store,
    mode: Mode,
    design: Design,
    input: String,
    input_prompt: String,
    status: Option<StatusMsg>,
    quit: bool,
}

pub fn run() -> Result<(), String> {
    let mut terminal = ratatui::init();
    let result = run_app(&mut terminal);
    ratatui::restore();
    result
}

fn run_app(terminal: &mut ratatui::DefaultTerminal) -> Result<(), String> {
    let mut app = App::new()?;
    while !app.quit {
        terminal
            .draw(|frame| app.draw(frame))
            .map_err(|e| e.to_string())?;
        if event::poll(Duration::from_millis(100)).map_err(|e| e.to_string())? {
            if let Event::Key(key) = event::read().map_err(|e| e.to_string())? {
                if key.kind == KeyEventKind::Press {
                    app.on_key(key);
                }
            }
        }
    }
    Ok(())
}

impl App {
    fn new() -> Result<Self, String> {
        Ok(Self {
            store: store::load()?,
            mode: Mode::Normal,
            design: Design::Minimal,
            input: String::new(),
            input_prompt: String::new(),
            status: None,
            quit: false,
        })
    }

    fn on_key(&mut self, key: KeyEvent) {
        match self.mode {
            Mode::Normal => match key.code {
                KeyCode::Char('q') => self.quit = true,
                KeyCode::Char('t') | KeyCode::Tab => self.design = self.design.next(),
                KeyCode::Char('i') | KeyCode::Char('p') => self.begin_input(),
                KeyCode::Char('o') => self.punch_out(),
                _ => {}
            },
            Mode::Input => match key.code {
                KeyCode::Enter => self.submit_input(),
                KeyCode::Esc => {
                    self.mode = Mode::Normal;
                    self.input.clear();
                }
                KeyCode::Backspace => {
                    self.input.pop();
                }
                KeyCode::Char(c) => self.input.push(c),
                _ => {}
            },
        }
    }

    fn begin_input(&mut self) {
        self.input_prompt = "project name: ".to_string();
        self.input.clear();
        self.mode = Mode::Input;
    }

    fn submit_input(&mut self) {
        let project = self.input.trim().to_string();
        self.input.clear();
        self.mode = Mode::Normal;
        self.report(commands::start(if project.is_empty() {
            None
        } else {
            Some(&project)
        }));
        self.reload();
    }

    fn punch_out(&mut self) {
        self.report(commands::stop());
        self.reload();
    }

    fn reload(&mut self) {
        match store::load() {
            Ok(s) => self.store = s,
            Err(e) => self.report(Err(e)),
        }
    }

    fn report(&mut self, result: Result<String, String>) {
        let is_error = result.is_err();
        let text = result.unwrap_or_else(|e| e);
        self.status = Some(StatusMsg { text, is_error });
    }

    fn elapsed(&self) -> Option<u64> {
        self.store
            .active
            .as_ref()
            .map(|a| (Local::now() - a.started_at).num_seconds().max(0) as u64)
    }

    fn timer_lines(&self) -> Vec<Line> {
        match &self.store.active {
            Some(active) => {
                let elapsed = self.elapsed().unwrap_or(0);
                let mut lines = big_time(elapsed)
                    .into_iter()
                    .map(|l| {
                        Line::from(Span::styled(
                            l,
                            Style::default()
                                .fg(Color::Green)
                                .add_modifier(Modifier::BOLD),
                        ))
                    })
                    .collect::<Vec<_>>();
                lines.push(Line::from(Span::styled(
                    format!("▶ {}", active.project),
                    Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
                )));
                lines.push(Line::from(format!(
                    "started {}",
                    active.started_at.format("%I:%M:%S %p")
                )));
                lines
            }
            None => vec![
                Line::from(Span::styled(
                    "00:00:00",
                    Style::default()
                        .fg(Color::DarkGray)
                        .add_modifier(Modifier::BOLD),
                )),
                Line::from("no active session"),
                Line::from("press i to punch in"),
            ],
        }
    }

    fn draw(&self, frame: &mut Frame) {
        let area = frame.area();
        let layout =
            Layout::vertical([Constraint::Length(3), Constraint::Min(0), Constraint::Length(3)])
                .split(area);
        self.draw_header(frame, layout[0]);
        self.draw_body(frame, layout[1]);
        self.draw_footer(frame, layout[2]);
    }

    fn draw_header(&self, frame: &mut Frame, area: ratatui::layout::Rect) {
        let now = Local::now();
        let title = Line::from(vec![
            Span::styled(
                "PUNCH",
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw(format!("  ·  {}", now.format("%a %b %e, %Y  %I:%M:%S %p"))),
            Span::styled(
                format!("  ·  design: {}", self.design.name()),
                Style::default().fg(Color::Magenta),
            ),
        ]);
        frame.render_widget(Paragraph::new(title).alignment(Alignment::Left), area);
    }

    fn draw_body(&self, frame: &mut Frame, area: ratatui::layout::Rect) {
        match self.design {
            Design::Minimal => self.draw_minimal(frame, area),
            Design::TodayLine => self.draw_today_line(frame, area),
            Design::SessionList => self.draw_session_list(frame, area),
            Design::GoalRing => self.draw_goal_ring(frame, area),
        }
    }

    fn today_stats(&self) -> (usize, u64, u64) {
        let today = store::today_sessions(&self.store.history);
        let total: u64 = today.iter().map(|s| s.duration_secs).sum();
        let yesterday = Local::now().date_naive() - chrono::Days::new(1);
        let y_total = store::total_on(&self.store.history, yesterday);
        (today.len(), total, y_total)
    }

    fn draw_minimal(&self, frame: &mut Frame, area: ratatui::layout::Rect) {
        let mut lines = self.timer_lines();
        if self.store.active.is_some() {
            let (count, total, _) = self.today_stats();
            lines.push(Line::from(""));
            lines.push(Line::from(Span::styled(
                format!("{} sessions today · {}", count, crate::store::format_duration(total)),
                Style::default().fg(Color::DarkGray),
            )));
        }
        frame.render_widget(
            Paragraph::new(lines).alignment(Alignment::Center),
            area,
        );
    }

    fn draw_today_line(&self, frame: &mut Frame, area: ratatui::layout::Rect) {
        let (count, total, y_total) = self.today_stats();
        let frac = if y_total > 0 {
            (total as f32 / y_total as f32).min(1.0)
        } else {
            0.0
        };
        let mut lines = self.timer_lines();
        lines.push(Line::from(""));
        lines.push(Line::from(vec![
            Span::styled(
                format!(
                    "{} · {} today  ",
                    count,
                    crate::store::format_duration(total)
                ),
                Style::default().fg(Color::DarkGray),
            ),
            Span::styled(bar(24, frac), Style::default().fg(Color::Yellow)),
            Span::styled(
                format!("  ({} yesterday)", crate::store::format_duration(y_total)),
                Style::default().fg(Color::DarkGray),
            ),
        ]));
        frame.render_widget(
            Paragraph::new(lines).alignment(Alignment::Center),
            area,
        );
    }

    fn draw_session_list(&self, frame: &mut Frame, area: ratatui::layout::Rect) {
        let today = store::today_sessions(&self.store.history);
        let mut lines = self.timer_lines();
        lines.push(Line::from(""));
        if today.is_empty() {
            lines.push(Line::from(Span::styled(
                "no sessions today",
                Style::default().fg(Color::DarkGray),
            )));
        }
        for s in today.iter().rev().take(8) {
            lines.push(Line::from(Span::styled(
                format!(
                    "{} – {}   {}   {:>12}",
                    s.started_at.format("%I:%M %p"),
                    s.ended_at.format("%I:%M %p"),
                    s.project,
                    crate::store::format_duration(s.duration_secs)
                ),
                Style::default().fg(Color::DarkGray),
            )));
        }
        frame.render_widget(
            Paragraph::new(lines).alignment(Alignment::Center),
            area,
        );
    }

    fn draw_goal_ring(&self, frame: &mut Frame, area: ratatui::layout::Rect) {
        let (_, total, y_total) = self.today_stats();
        let frac = if y_total > 0 {
            (total as f32 / y_total as f32).min(1.0)
        } else {
            0.0
        };
        let mut lines = self.timer_lines();
        lines.push(Line::from(""));
        lines.extend(
            ring(frac)
                .into_iter()
                .map(|l| Line::from(Span::styled(l, Style::default().fg(Color::Yellow)))),
        );
        lines.push(Line::from(Span::styled(
            format!(
                "today {}  ·  yesterday {}",
                crate::store::format_duration(total),
                crate::store::format_duration(y_total)
            ),
            Style::default().fg(Color::DarkGray),
        )));
        frame.render_widget(
            Paragraph::new(lines).alignment(Alignment::Center),
            area,
        );
    }

    fn draw_footer(&self, frame: &mut Frame, area: ratatui::layout::Rect) {
        let layout = Layout::vertical([
            Constraint::Length(1),
            Constraint::Length(1),
            Constraint::Length(1),
        ])
        .split(area);

        if let Some(msg) = &self.status {
            let color = if msg.is_error { Color::Red } else { Color::Green };
            frame.render_widget(
                Paragraph::new(msg.text.clone()).style(Style::default().fg(color)),
                layout[0],
            );
        }

        if self.mode == Mode::Input {
            let content = Line::from(vec![
                Span::styled(
                    self.input_prompt.clone(),
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::styled(format!("{}▌", self.input), Style::default().fg(Color::White)),
            ]);
            frame.render_widget(Paragraph::new(content), layout[1]);
        }

        let hints = match self.mode {
            Mode::Normal => format!("q quit · i in · o out · t design ({})", self.design.name()),
            Mode::Input => "enter confirm · esc cancel".to_string(),
        };
        frame.render_widget(
            Paragraph::new(hints).style(Style::default().fg(Color::DarkGray)),
            layout[2],
        );
    }
}

// ---------- helpers ----------

fn bar(width: usize, frac: f32) -> String {
    let filled = (width as f32 * frac).round().max(0.0) as usize;
    format!(
        "{}{}",
        "█".repeat(filled.min(width)),
        "░".repeat(width.saturating_sub(filled))
    )
}

fn ring(frac: f32) -> Vec<String> {
    const W: usize = 13;
    const H: usize = 7;
    let mut cells: Vec<(usize, usize)> = Vec::new();
    for x in 1..=W - 2 {
        cells.push((x, 0));
    }
    for y in 1..=H - 2 {
        cells.push((W - 1, y));
    }
    for x in (1..=W - 2).rev() {
        cells.push((x, H - 1));
    }
    for y in (1..=H - 2).rev() {
        cells.push((0, y));
    }
    let filled = (frac * cells.len() as f32).round().max(0.0) as usize;
    let mut grid = vec![vec![' '; W]; H];
    for (x, y) in &cells {
        grid[*y][*x] = '░';
    }
    for (x, y) in cells.into_iter().take(filled) {
        grid[y][x] = '█';
    }
    grid.into_iter().map(|row| row.into_iter().collect()).collect()
}

fn big_time(secs: u64) -> Vec<String> {
    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    let parts = [format!("{:02}", h), format!("{:02}", m), format!("{:02}", s)];
    let mut out = vec![String::new(); 5];
    for (i, part) in parts.iter().enumerate() {
        for ch in part.chars() {
            let glyph = digit(ch);
            for row in 0..5 {
                out[row].push_str(glyph[row]);
                out[row].push(' ');
            }
        }
        if i < 2 {
            let colon = digit(':');
            for row in 0..5 {
                out[row].push_str(colon[row]);
                out[row].push(' ');
            }
        }
    }
    out
}

fn digit(c: char) -> &'static [&'static str; 5] {
    match c {
        '0' => &["███", "█ █", "█ █", "█ █", "███"],
        '1' => &[" █ ", "██ ", " █ ", " █ ", "███"],
        '2' => &["███", "  █", "███", "█  ", "███"],
        '3' => &["███", "  █", "███", "  █", "███"],
        '4' => &["█ █", "█ █", "███", "  █", "  █"],
        '5' => &["███", "█  ", "███", "  █", "███"],
        '6' => &["███", "█  ", "███", "█ █", "███"],
        '7' => &["███", "  █", "  █", "  █", "  █"],
        '8' => &["███", "█ █", "███", "█ █", "███"],
        '9' => &["███", "█ █", "███", "  █", "███"],
        ':' => &["   ", " █ ", "   ", " █ ", "   "],
        _ => &["   ", "   ", "   ", "   ", "   "],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::{Active, Session};
    use chrono::Duration as ChronoDuration;

    fn fake_store() -> Store {
        let now = Local::now();
        let mut history = Vec::new();
        for (i, (name, mins)) in [("web", 45), ("blog", 90), ("tui", 30)].iter().enumerate() {
            let start = now - ChronoDuration::minutes(180) + ChronoDuration::minutes(40 * i as i64);
            let end = start + ChronoDuration::minutes(*mins as i64);
            history.push(Session {
                project: name.to_string(),
                started_at: start,
                ended_at: end,
                duration_secs: (*mins as u64) * 60,
            });
        }
        let y_start = now - ChronoDuration::days(1) - ChronoDuration::minutes(30);
        history.push(Session {
            project: "blog".to_string(),
            started_at: y_start,
            ended_at: y_start + ChronoDuration::minutes(70),
            duration_secs: 70 * 60,
        });
        let start = now - ChronoDuration::minutes(5);
        Store {
            active: Some(Active {
                project: "tui".to_string(),
                started_at: start,
            }),
            history,
        }
    }

    fn render(design: Design, w: u16, h: u16) -> String {
        let mut app = App::new().unwrap();
        app.store = fake_store();
        app.design = design;
        let backend = ratatui::backend::TestBackend::new(w, h);
        let mut terminal = ratatui::Terminal::new(backend).unwrap();
        terminal.draw(|f| app.draw(f)).unwrap();
        let buffer = terminal.backend().buffer().clone();
        let mut out = String::new();
        for y in 0..buffer.area.height {
            for x in 0..buffer.area.width {
                out.push_str(buffer[(x, y)].symbol());
            }
            out.push('\n');
        }
        out
    }

    #[test]
    fn renders_all_designs_without_panicking() {
        for d in [
            Design::Minimal,
            Design::TodayLine,
            Design::SessionList,
            Design::GoalRing,
        ] {
            render(d, 120, 32);
        }
    }

    #[test]
    fn writes_previews_for_comparison() {
        for d in [
            Design::Minimal,
            Design::TodayLine,
            Design::SessionList,
            Design::GoalRing,
        ] {
            let out = render(d, 120, 32);
            std::fs::write(format!("target/preview-{}.txt", d.name()), out).unwrap();
        }
    }
}
