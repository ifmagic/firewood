// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    CustomMenuItem, Manager, Menu, MenuItem, RunEvent, Submenu, SystemTray, SystemTrayEvent,
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
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");
    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);

    let system_tray = SystemTray::new().with_menu(tray_menu);

    let mut builder = tauri::Builder::default();

    #[cfg(target_os = "macos")]
    {
        let about_firewood = CustomMenuItem::new("about_firewood".to_string(), "About Firewood");
        let check_for_updates =
            CustomMenuItem::new("check_for_updates".to_string(), "Check for Updates…");
        let app_menu = Menu::new().add_submenu(Submenu::new(
            "Firewood",
            Menu::new()
                .add_item(about_firewood)
                .add_native_item(MenuItem::Separator)
                .add_item(check_for_updates)
                .add_native_item(MenuItem::Separator)
                .add_native_item(MenuItem::Quit),
        ));

        builder = builder.menu(app_menu).on_menu_event(|event| {
            if event.menu_item_id() == "about_firewood" {
                let _ = event.window().app_handle().emit_all("app://about-firewood", ());
            } else if event.menu_item_id() == "check_for_updates" {
                let _ = event.window().app_handle().emit_all("app://check-for-updates", ());
            }
        });
    }

    let app = builder
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                show_window(app);
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "show" => {
                    show_window(app);
                }
                "quit" => {
                    std::process::exit(0);
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

    app.run(|_app_handle, event| {
        if let RunEvent::ExitRequested { api, .. } = event {
            api.prevent_exit();
        }
    });
}
