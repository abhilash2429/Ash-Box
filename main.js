/**
 * main.js
 * Electron main process.
 * - Creates the BrowserWindow
 * - Handles IPC: receives run requests, calls executor, streams output back
 * - Enforces one execution at a time
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createDockerClient } = require('./docker');
const { runExecution } = require('./executor');
const { LANGUAGES } = require('./languages');

let mainWindow = null;
let isRunning = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Executor',
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/**
 * IPC: renderer -> main
 * Channel: 'get-languages'
 * Returns the language registry so the renderer can build the selector without
 * duplicating language metadata in renderer code.
 */
ipcMain.handle('get-languages', () => {
  return Object.values(LANGUAGES).map(({ id, label, hasDeps, depsLabel, depsPlaceholder }) => ({
    id, label, hasDeps, depsLabel, depsPlaceholder,
  }));
});

/**
 * IPC: renderer -> main
 * Channel: 'run-code'
 * Payload: { code: string, languageId: string, dependencies: string }
 */
ipcMain.handle('run-code', async (event, { code, languageId, dependencies }) => {
  if (isRunning) {
    return { error: 'An execution is already in progress' };
  }

  isRunning = true;
  mainWindow.webContents.send('execution-state', { running: true });

  const deps = dependencies
    .split(/[\s,]+/)
    .map(d => d.trim())
    .filter(d => d.length > 0);

  const onLine = (line, type) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('output-line', { line, type });
    }
  };

  try {
    const result = await runExecution(code, languageId, deps, onLine);
    return { exitCode: result.exitCode };
  } catch (err) {
    return { error: err.message };
  } finally {
    isRunning = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('execution-state', { running: false });
    }
  }
});

/**
 * IPC: renderer -> main
 * Channel: 'check-docker'
 */
ipcMain.handle('check-docker', async () => {
  const docker = createDockerClient();
  try {
    await docker.ping();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
