# luWidget

A minimal desktop widget for todo lists and pomodoro timer built with Tauri and React.

![Screenshot](assets/Screenshot.png)

## Usage

- **Todo**: Click item to add/edit, enter to save, check to dismiss in 15s
- **Timer**: Click timer to start/pause, scroll to adjust minutes (0-60, default 45)
- **System Tray**: Right-click to set up autostart or quit the app.

## Prerequisites

- Windows (but should be easy to adapt to other OS)
- Node.js (v18 or later)
- Rust and Cargo
- npm

## Build Instructions

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Build Tauri app
npm run tauri build
```
