// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod pty;
mod translate;

use pty::create_pty_manager;
use std::sync::Arc;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, State,
};

#[tauri::command]
fn create_pty_session(
    pty_manager: State<'_, Arc<pty::PtyManager>>,
    shell: Option<String>,
    cwd: Option<String>,
) -> Result<pty::PtyInfo, String> {
    pty_manager.create_session(shell.as_deref(), cwd.as_deref())
}

#[tauri::command]
fn write_pty(
    pty_manager: State<'_, Arc<pty::PtyManager>>,
    id: String,
    data: String,
) -> Result<(), String> {
    pty_manager.write(&id, &data)
}

#[tauri::command]
fn resize_pty(
    pty_manager: State<'_, Arc<pty::PtyManager>>,
    id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    pty_manager.resize(&id, rows, cols)
}

#[tauri::command]
fn close_pty_session(
    pty_manager: State<'_, Arc<pty::PtyManager>>,
    id: String,
) -> Result<(), String> {
    pty_manager.close_session(&id)
}

#[tauri::command]
fn get_default_shell() -> String {
    pty::PtyManager::get_default_shell()
}

#[tauri::command]
fn start_pty_reader(
    app: tauri::AppHandle,
    pty_manager: State<'_, Arc<pty::PtyManager>>,
    id: String,
) {
    pty_manager.read_output(&id, app);
}

#[tauri::command]
fn list_shells() -> Vec<String> {
    let candidates = vec![
        "/bin/zsh",
        "/bin/bash",
        "/bin/sh",
        "/usr/local/bin/fish",
        "/opt/homebrew/bin/fish",
    ];
    candidates
        .into_iter()
        .filter(|p| std::path::Path::new(p).exists())
        .map(|p| p.to_string())
        .collect()
}

#[tauri::command]
fn list_system_fonts() -> Vec<String> {
    use font_kit::source::SystemSource;
    match SystemSource::new().all_families() {
        Ok(families) => {
            let mut sorted = families;
            sorted.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
            sorted
        }
        Err(_) => vec!["monospace".to_string()],
    }
}

fn show_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn main() {
    let pty_manager = create_pty_manager();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(pty_manager)
        .invoke_handler(tauri::generate_handler![
            translate::baidu_translate,
            translate::tencent_translate,
            create_pty_session,
            write_pty,
            resize_pty,
            close_pty_session,
            get_default_shell,
            start_pty_reader,
            list_shells,
            list_system_fonts,
        ]);

    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        show_window(app);
    }));

    builder
        .setup(|app| {
            let show_item =
                MenuItemBuilder::with_id("show", "Show Window").build(app)?;
            let check_updates_tray =
                MenuItemBuilder::with_id("check_for_updates", "Check for Updates…")
                    .build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&check_updates_tray)
                .separator()
                .item(&quit_item)
                .build()?;

            TrayIconBuilder::new()
                .icon(tauri::image::Image::from_bytes(include_bytes!(
                    "../icons/tray-icon.png"
                ))?)
                .icon_as_template(false)
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show" => {
                        show_window(app);
                    }
                    "check_for_updates" => {
                        show_window(app);
                        let _ = app.emit("app://check-for-updates", ());
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_window(tray.app_handle());
                    }
                })
                .build(app)?;

            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{PredefinedMenuItem, SubmenuBuilder};
                
                let app_submenu = SubmenuBuilder::new(app, "Firewood")
                    .item(&PredefinedMenuItem::hide(app, None)?)
                    .item(&PredefinedMenuItem::hide_others(app, None)?)
                    .item(&PredefinedMenuItem::show_all(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::quit(app, None)?)
                    .build()?;

                let edit_submenu = SubmenuBuilder::new(app, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;

                let window_submenu = SubmenuBuilder::new(app, "Window")
                    .minimize()
                    .close_window()
                    .build()?;

                let menu = MenuBuilder::new(app)
                    .item(&app_submenu)
                    .item(&edit_submenu)
                    .item(&window_submenu)
                    .build()?;
                app.set_menu(menu)?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                #[cfg(target_os = "macos")]
                {
                    let app = window.app_handle();
                    let _ = app.hide();
                }
                #[cfg(not(target_os = "macos"))]
                {
                    let _ = window.hide();
                }
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Some(pty_manager) = app_handle.try_state::<Arc<pty::PtyManager>>() {
                    pty_manager.close_all();
                }
            }
        });
}
