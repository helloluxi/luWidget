// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent, MouseButtonState};
use tauri::{WebviewUrl, WebviewWindowBuilder};
use tauri::menu::{Menu, CheckMenuItem};
use auto_launch::AutoLaunchBuilder;
use std::sync::Mutex;

struct AutoLaunchState(Mutex<Option<auto_launch::AutoLaunch>>);

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn toggle_auto_launch(app: tauri::AppHandle) -> Result<bool, String> {
    let state = app.state::<AutoLaunchState>();
    let auto_launch_opt = state.0.lock().unwrap();
    
    if let Some(auto_launch) = auto_launch_opt.as_ref() {
        let is_enabled = auto_launch.is_enabled().unwrap_or(false);
        if is_enabled {
            auto_launch.disable().map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            auto_launch.enable().map_err(|e| e.to_string())?;
            Ok(true)
        }
    } else {
        Err("AutoLaunch not initialized".to_string())
    }
}

#[tauri::command]
async fn show_notification(app: tauri::AppHandle, message: String) -> Result<(), String> {
    // Close any existing notification window
    if let Some(window) = app.get_webview_window("notification") {
        let _ = window.close();
    }

    // Create new notification window
    let window = WebviewWindowBuilder::new(
        &app,
        "notification",
        WebviewUrl::App("notification.html".into())
    )
    .title("Notification")
    .inner_size(600.0, 200.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .resizable(false)
    .skip_taskbar(true)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    // Pass the message to the notification window
    let _ = window.eval(&format!("window.__NOTIFICATION_MESSAGE__ = {}", serde_json::to_string(&message).unwrap()));

    Ok(())
}

#[tauri::command]
fn close_notification(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("notification") {
        let _ = window.close();
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Setup auto-launch
            let auto_launch = if let Ok(exe_path) = std::env::current_exe() {
                if let Some(exe_str) = exe_path.to_str() {
                    AutoLaunchBuilder::new()
                        .set_app_name("luWidget")
                        .set_app_path(exe_str)
                        .build()
                        .ok()
                } else {
                    None
                }
            } else {
                None
            };

            // Check if auto-launch is currently enabled
            let is_enabled = auto_launch.as_ref()
                .and_then(|al| al.is_enabled().ok())
                .unwrap_or(false);

            // Store the auto_launch instance in app state
            app.manage(AutoLaunchState(Mutex::new(auto_launch)));

            // Setup system tray with menu
            let toggle_autostart = CheckMenuItem::with_id(app, "toggle_autostart", "Start on boot", true, is_enabled, None::<&str>)?;
            let quit = tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_autostart, &quit])?;

            TrayIconBuilder::with_id("luwidget-tray")
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .expect("missing default window icon"),
                )
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("luWidget")
                .on_menu_event(move |app, event| {
                    match event.id.as_ref() {
                        "toggle_autostart" => {
                            if let Ok(new_state) = toggle_auto_launch(app.clone()) {
                                // Update checkbox state
                                if let Some(item) = menu.get("toggle_autostart") {
                                    if let Some(check_item) = item.as_check_menuitem() {
                                        let _ = check_item.set_checked(new_state);
                                    }
                                }
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray_handle, event| {
                    match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } => {
                            if let Some(window) = tray_handle.app_handle().get_webview_window("main") {
                                match window.is_visible() {
                                    Ok(true) => {
                                        let _ = window.hide();
                                    }
                                    _ => {
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![exit_app, show_notification, close_notification, toggle_auto_launch])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
