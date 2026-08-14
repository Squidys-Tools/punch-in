mod app;
mod commands;
mod store;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "punch", version, about = "A simple CLI time tracker")]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand)]
enum Command {
    /// Punch in: start tracking time on a project
    In {
        /// Project or task name (defaults to "general")
        project: Option<String>,
    },
    /// Punch out: stop the active session and record it
    Out,
    /// Show the active session and elapsed time
    Status,
}

fn main() {
    let cli = Cli::parse();
    let result = match cli.command {
        Some(Command::In { project }) => commands::start(project.as_deref()).map(|m| println!("{m}")),
        Some(Command::Out) => commands::stop().map(|m| println!("{m}")),
        Some(Command::Status) => commands::status().map(|m| println!("{m}")),
        None => app::run(),
    };
    if let Err(err) = result {
        eprintln!("error: {err}");
        std::process::exit(1);
    }
}
