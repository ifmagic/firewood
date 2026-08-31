// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod moxia;
mod pty;
mod translate;

use moxia::create_moxia_manager;
use pty::create_pty_manager;
use std::sync::{Arc, OnceLock};
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
    rows: Option<u16>,
    cols: Option<u16>,
) -> Result<pty::PtyInfo, String> {
    pty_manager.create_session(shell.as_deref(), cwd.as_deref(), rows, cols)
}

#[tauri::command]
async fn write_pty(
    pty_manager: State<'_, Arc<pty::PtyManager>>,
    id: String,
    data: String,
) -> Result<(), String> {
    let manager = pty_manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.write(&id, &data))
        .await
        .map_err(|err| format!("PTY write task failed: {}", err))?
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
async fn close_pty_session(
    pty_manager: State<'_, Arc<pty::PtyManager>>,
    id: String,
) -> Result<(), String> {
    let manager = pty_manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.close_session(&id))
        .await
        .map_err(|err| format!("PTY close task failed: {}", err))?
}

#[tauri::command]
fn get_default_shell() -> Result<String, String> {
    Ok(pty::PtyManager::get_default_shell())
}

#[tauri::command]
fn start_pty_reader(
    app: tauri::AppHandle,
    pty_manager: State<'_, Arc<pty::PtyManager>>,
    id: String,
) -> Result<(), String> {
    pty_manager.read_output(&id, app)
}

#[tauri::command]
fn list_shells() -> Result<Vec<String>, String> {
    let candidates = vec![
        "/bin/zsh",
        "/bin/bash",
        "/bin/sh",
        "/usr/local/bin/fish",
        "/opt/homebrew/bin/fish",
    ];
    Ok(candidates
        .into_iter()
        .filter(|p| std::path::Path::new(p).exists())
        .map(|p| p.to_string())
        .collect())
}

static MONOSPACE_FONT_FAMILIES: OnceLock<Vec<String>> = OnceLock::new();

fn font_is_monospace(font: &font_kit::font::Font) -> bool {
    let (Some(i_glyph), Some(w_glyph)) = (font.glyph_for_char('i'), font.glyph_for_char('W'))
    else {
        return false;
    };
    let (Ok(i_advance), Ok(w_advance)) = (font.advance(i_glyph), font.advance(w_glyph)) else {
        return false;
    };
    (i_advance.x() - w_advance.x()).abs() < 1e-4
}

fn family_is_monospace(source: &font_kit::source::SystemSource, family: &str) -> bool {
    let Ok(handle) = source.select_family_by_name(family) else {
        return false;
    };
    let Some(font) = handle.fonts().iter().find_map(|h| h.load().ok()) else {
        return false;
    };
    font_is_monospace(&font)
}

fn scan_monospace_families() -> Vec<String> {
    use font_kit::source::SystemSource;

    let source = SystemSource::new();
    let Ok(families) = source.all_families() else {
        return vec!["monospace".to_string()];
    };

    let mut monospace: Vec<String> = families
        .into_iter()
        .filter(|family| family_is_monospace(&source, family))
        .collect();
    monospace.sort_by_key(|family| family.to_lowercase());
    monospace
}

#[tauri::command]
async fn list_system_fonts() -> Result<Vec<String>, String> {
    if let Some(fonts) = MONOSPACE_FONT_FAMILIES.get() {
        return Ok(fonts.clone());
    }
    let fonts = tauri::async_runtime::spawn_blocking(scan_monospace_families)
        .await
        .map_err(|err| format!("Font scan task failed: {}", err))?;
    let _ = MONOSPACE_FONT_FAMILIES.set(fonts.clone());
    Ok(fonts)
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
    let moxia_manager = create_moxia_manager();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(pty_manager)
        .manage(moxia_manager)
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
            moxia::commands::moxia_create_book,
            moxia::commands::moxia_open_book,
            moxia::commands::moxia_close_book,
            moxia::commands::moxia_get_book_meta,
            moxia::commands::moxia_update_book_meta,
            moxia::commands::moxia_list_chapters,
            moxia::commands::moxia_get_chapter,
            moxia::commands::moxia_create_chapter,
            moxia::commands::moxia_update_chapter,
            moxia::commands::moxia_delete_chapter,
            moxia::commands::moxia_reorder_chapters,
            moxia::commands::moxia_get_next_chapter_sort_order,
            moxia::commands::moxia_list_characters,
            moxia::commands::moxia_get_character,
            moxia::commands::moxia_create_character,
            moxia::commands::moxia_update_character,
            moxia::commands::moxia_delete_character,
            moxia::commands::moxia_list_relations,
            moxia::commands::moxia_add_relation,
            moxia::commands::moxia_update_relation,
            moxia::commands::moxia_delete_relation,
            moxia::commands::moxia_get_setting,
            moxia::commands::moxia_set_setting,
            moxia::commands::moxia_get_all_settings,
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
                if let Some(moxia_manager) =
                    app_handle.try_state::<Arc<moxia::MoxiaManager>>()
                {
                    moxia_manager.close_all();
                }
            }
        });
}
