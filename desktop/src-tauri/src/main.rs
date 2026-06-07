#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::CommandChild;

#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;

struct BackendState(Mutex<Option<CommandChild>>);

#[cfg(debug_assertions)]
fn spawn_sidecar(_app: &AppHandle) -> tauri::Result<()> {
    Ok(())
}

#[cfg(not(debug_assertions))]
fn spawn_sidecar(app: &AppHandle) -> tauri::Result<()> {
    let (_rx, child) = app
        .shell()
        .sidecar("hermes-backend")
        .map_err(shell_error)?
        .spawn()
        .map_err(shell_error)?;
    app.manage(BackendState(Mutex::new(Some(child))));
    Ok(())
}

fn stop_sidecar(app: &AppHandle) {
    if let Some(state) = app.try_state::<BackendState>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

#[cfg(not(debug_assertions))]
fn shell_error(error: tauri_plugin_shell::Error) -> tauri::Error {
    std::io::Error::other(error.to_string()).into()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            spawn_sidecar(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                stop_sidecar(&window.app_handle());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Hermes desktop shell");
}
