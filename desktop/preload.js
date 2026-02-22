/**
 * preload.js
 * Exposes a minimal, typed API to the renderer via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('executor', {
  /** @returns {Promise<Array<{id, label, hasDeps, depsLabel, depsPlaceholder}>>} */
  getLanguages: () => ipcRenderer.invoke('get-languages'),

  /**
   * @param {string} code
   * @param {string} languageId
   * @param {string} dependencies
   * @returns {Promise<{ exitCode?: number, error?: string }>}
   */
  runCode: (code, languageId, dependencies) =>
    ipcRenderer.invoke('run-code', { code, languageId, dependencies }),

  /** @returns {Promise<{ ok: boolean, error?: string }>} */
  checkDocker: () => ipcRenderer.invoke('check-docker'),

  /** @param {(data: { line: string, type: string }) => void} callback */
  onOutputLine: (callback) => {
    ipcRenderer.on('output-line', (_, data) => callback(data));
  },

  /** @param {(data: { running: boolean }) => void} callback */
  onExecutionState: (callback) => {
    ipcRenderer.on('execution-state', (_, data) => callback(data));
  },

  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('output-line');
    ipcRenderer.removeAllListeners('execution-state');
  },
});
