# Ash Box

Ephemeral local code execution tool. Paste code, declare dependencies, run, destroy.

## Project Structure

```text
Ash-Box/
  desktop/    Electron desktop app (main, preload, UI)
  runtime/    Docker execution runtime and bridge server
  extension/  Chrome side-panel extension
  scripts/    Utility scripts (icon generation)
```

## Supported Languages

- Python (pip packages)
- JavaScript (npm packages)
- Go (stdlib only)
- Ruby (gems)
- Java (public class must be `Main`)
- C
- C++

## Prerequisites

- Node.js 18+
- Docker Desktop (required only for code execution)

## Setup

```bash
npm install
npm run build-image
```

## Run Desktop App

```bash
npm start
```

## Run Chrome Extension

1. Start the local bridge:

```bash
npm run bridge
```

2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the `Ash-Box/extension` folder.

### Extension Shortcuts

- `Alt+S`: open/toggle side panel
- `Ctrl+Enter`: run code

## Notes

- Side panel open/toggle does not require Docker.
- Docker is only needed when executing code (`Run`).

## Troubleshooting

- `Runtime unavailable`: start Docker Desktop and run `npm run bridge`.
- `Base image not found`: run `npm run build-image`.
- `Port 3876 is already in use`: stop the process using that port, or run bridge with another port.
