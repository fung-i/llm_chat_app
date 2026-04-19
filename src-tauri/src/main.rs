#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Emitter, Manager};
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::process::CommandEvent;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;

#[tauri::command]
fn app_data_stronghold_path(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir
        .join("llm-chat.stronghold")
        .to_string_lossy()
        .into_owned())
}

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:llm_chat.db",
                    vec![
                        tauri_plugin_sql::Migration {
                            version: 1_i64,
                            description: "init schema",
                            sql: include_str!("../migrations/001_init.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                        tauri_plugin_sql::Migration {
                            version: 2_i64,
                            description: "seed model_profiles",
                            sql: include_str!("../migrations/002_seed_model_profiles.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let salt_path = app
                .path()
                .app_local_data_dir()
                .map_err(|e| format!("app_local_data_dir: {e}"))?
                .join("stronghold_salt.txt");
            if let Some(parent) = salt_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            app.handle()
                .plugin(
                    tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build(),
                )
                .map_err(|e| format!("stronghold plugin: {e}"))?;

            let handle = app.handle().clone();

            #[cfg(debug_assertions)]
            {
                let port: u16 = std::env::var("SIDECAR_PORT")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(8765);
                let _ = handle.emit("sidecar-ready", serde_json::json!({ "port": port }));
                eprintln!(
                    "[llm-chat-app] Dev: sidecar expected on {port}. Run: bun --cwd sidecar run dev"
                );
            }

            #[cfg(not(debug_assertions))]
            {
                let h = handle.clone();
                tauri::async_runtime::spawn(async move {
                    match h.shell().sidecar("llm-sidecar") {
                        Ok(cmd) => match cmd.env("SIDECAR_PORT", "8765").spawn() {
                            Ok((mut rx, _child)) => {
                                while let Some(event) = rx.recv().await {
                                    if let CommandEvent::Stdout(bytes) = event {
                                        let text = String::from_utf8_lossy(&bytes);
                                        for line in text.lines() {
                                            if let Some(rest) = line.trim().strip_prefix("SIDECAR_READY:")
                                            {
                                                if let Ok(port) = rest.trim().parse::<u16>() {
                                                    let _ = h.emit(
                                                        "sidecar-ready",
                                                        serde_json::json!({ "port": port }),
                                                    );
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            Err(e) => eprintln!("[llm-chat-app] sidecar spawn failed: {e}"),
                        },
                        Err(e) => eprintln!("[llm-chat-app] sidecar not configured: {e}"),
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_data_stronghold_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
