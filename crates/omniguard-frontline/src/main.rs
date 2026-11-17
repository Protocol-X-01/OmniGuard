use clap::Parser;
use std::{
    fs,
    io::{self, Read, Write},
    path::PathBuf,
    process::ExitCode,
    time::{SystemTime, UNIX_EPOCH},
};
#[derive(Parser)]
#[command(version, about = "Assess synthetic front-line team-control evidence")]
struct Args {
    input: PathBuf,
    #[arg(long)]
    output: Option<PathBuf>,
    #[arg(long, help = "Epoch seconds for a reproducible fixture assessment")]
    at: Option<u64>,
}
fn run(args: Args) -> Result<u8, Box<dyn std::error::Error>> {
    if fs::symlink_metadata(&args.input)?.file_type().is_symlink() {
        return Err("Input links are not accepted".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(&args.input)?
        .take(65_537)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 65_536 {
        return Err("Intake exceeds 64 KiB".into());
    }
    let input = serde_json::from_slice(&bytes)?;
    let at = args
        .at
        .unwrap_or(SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs());
    let report = omniguard_frontline::assess(&input, at)?;
    let rendered = serde_json::to_string_pretty(&report)? + "\n";
    if let Some(path) = args.output {
        fs::write(path, rendered)?;
    } else {
        io::stdout().lock().write_all(rendered.as_bytes())?;
    }
    let rows = report["results"].as_array().unwrap();
    Ok(if rows.iter().any(|r| r["coverage"] != "assessed") {
        2
    } else if rows.iter().any(|r| r["outcome"] == "fail") {
        1
    } else {
        0
    })
}
fn main() -> ExitCode {
    match run(Args::parse()) {
        Ok(n) => ExitCode::from(n),
        Err(e) => {
            eprintln!("omniguard-frontline: {e}");
            ExitCode::from(2)
        }
    }
}
