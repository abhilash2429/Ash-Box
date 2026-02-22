/**
 * desktop/main.js
 * Electron main process.
 * - Creates the BrowserWindow
 * - Handles IPC for language list, execution, and runtime checks
 */

'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createDockerClient } = require('../runtime/docker');
const { runExecution } = require('../runtime/executor');
const { LANGUAGES } = require('../runtime/languages');

let mainWindow = null;
let isRunning = false;

function parseDependencies(value) {
  return value
    .split(/[\s,]+/)
    .map((dep) => dep.trim())
    .filter(Boolean);
}

function normalizeRunPayload(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const code = typeof data.code === 'string' ? data.code : '';
  const languageId = typeof data.languageId === 'string' ? data.languageId : '';
  const dependencies = typeof data.dependencies === 'string' ? data.dependencies : '';
  return { code, languageId, dependencies };
}

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
    title: 'Ash Box',
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-languages', () => {
  return Object.values(LANGUAGES).map(({ id, label, hasDeps, depsLabel, depsPlaceholder }) => ({
    id,
    label,
    hasDeps,
    depsLabel,
    depsPlaceholder,
  }));
});

ipcMain.handle('run-code', async (_event, payload) => {
  const { code, languageId, dependencies } = normalizeRunPayload(payload);

  if (!code.trim()) {
    return { error: 'Code is required' };
  }

  if (!LANGUAGES[languageId]) {
    return { error: `Unsupported language: ${languageId || 'unknown'}` };
  }

  if (isRunning) {
    return { error: 'An execution is already in progress' };
  }

  isRunning = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('execution-state', { running: true });
  }

  const deps = parseDependencies(dependencies);

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

ipcMain.handle('check-docker', async () => {
  const docker = createDockerClient();
  try {
    await docker.ping();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
