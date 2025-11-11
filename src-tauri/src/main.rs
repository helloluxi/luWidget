// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{WebviewUrl, WebviewWindowBuilder};
use auto_launch::AutoLaunchBuilder;

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
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
            // Setup auto-launch only in release builds
            #[cfg(not(debug_assertions))]
            {
                if let Ok(exe_path) = std::env::current_exe() {
                    if let Some(exe_str) = exe_path.to_str() {
                        if let Ok(auto_launch) = AutoLaunchBuilder::new()
                            .set_app_name("luWidget")
                            .set_app_path(exe_str)
                            .build()
                        {
                            let _ = auto_launch.enable();
                        }
                    }
                }
            }
            // Setup system tray
            TrayIconBuilder::with_id("luwidget-tray")
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .expect("missing default window icon"),
                )
                .tooltip("luWidget")
                .on_tray_icon_event(|tray_handle, event| {
                    match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: tauri::tray::MouseButtonState::Up,
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
        .invoke_handler(tauri::generate_handler![exit_app, show_notification, close_notification])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
