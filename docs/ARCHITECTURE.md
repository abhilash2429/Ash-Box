# Architecture

## Top-Level Modules

- `desktop/`: Electron process + desktop UI.
- `runtime/`: Docker execution engine and HTTP bridge.
- `extension/`: Chrome side panel extension.
- `scripts/`: Utility scripts.

## Data Flow

1. User writes code in desktop or side panel UI.
2. UI submits request to bridge/runtime.
3. Runtime launches isolated Docker container.
4. Output streams back to UI.
