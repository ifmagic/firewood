// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod translate;

use tauri::{
    CustomMenuItem, Manager, Menu, MenuEntry, MenuItem, SystemTray, SystemTrayEvent,
    SystemTrayMenu, SystemTrayMenuItem,
};

fn show_window(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.show();
    if let Some(window) = app.get_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn main() {
    let show = CustomMenuItem::new("show".to_string(), "Show Window");
    let check_for_updates_tray =
        CustomMenuItem::new("check_for_updates".to_string(), "Check for Updates…");
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");
    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(check_for_updates_tray)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);

    let system_tray = SystemTray::new().with_menu(tray_menu);

    let mut builder = tauri::Builder::default();

    #[cfg(target_os = "macos")]
    {
        let about_firewood = CustomMenuItem::new("about_firewood".to_string(), "About Firewood");
        let check_for_updates =
            CustomMenuItem::new("check_for_updates".to_string(), "Check for Updates…");
        let mut menu = Menu::os_default("Firewood");

        if let Some(MenuEntry::Submenu(app_submenu)) = menu.items.first_mut() {
            if !app_submenu.inner.items.is_empty() {
                app_submenu.inner.items[0] = about_firewood.into();
            }

            let insert_index = app_submenu
                .inner
                .items
                .iter()
                .position(|item| matches!(item, MenuEntry::NativeItem(MenuItem::Separator)))
                .unwrap_or(app_submenu.inner.items.len());
            app_submenu
                .inner
                .items
                .insert(insert_index, check_for_updates.into());
        }

        builder = builder.menu(menu).on_menu_event(move |event| {
            if event.menu_item_id() == "about_firewood" {
                let _ = event.window().app_handle().emit_all("app://about-firewood", ());
            } else if event.menu_item_id() == "check_for_updates" {
                let _ = event.window().app_handle().emit_all("app://check-for-updates", ());
            }
        });
    }

    let app = builder
        .invoke_handler(tauri::generate_handler![
            translate::baidu_translate,
            translate::tencent_translate,
        ])
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                show_window(app);
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "show" => {
                    show_window(app);
                }
                "check_for_updates" => {
                    show_window(app);
                    let _ = app.emit_all("app://check-for-updates", ());
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            },
            _ => {}
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                let app = event.window().app_handle();
                #[cfg(target_os = "macos")]
                let _ = app.hide();
                #[cfg(not(target_os = "macos"))]
                let _ = event.window().hide();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_, _| {});
}
