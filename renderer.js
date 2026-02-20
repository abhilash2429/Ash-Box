/**
 * renderer.js
 * Runs in the renderer process (browser context).
 * Access to Node/Electron is only via window.executor (contextBridge).
 *
 * Responsibilities:
 * - Load language registry from main process
 * - Build language tab bar
 * - Initialize Monaco Editor with correct language mode
 * - Wire Run button to executor.runCode with selected language
 * - Toggle dependency input based on whether selected language supports deps
 * - Stream output lines into the console pane
 * - Lock editor/controls during execution
 */

'use strict';

require.config({
  paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }
});

// Per-language starter templates shown when switching languages.
// Keeps the editor non-empty so the user has a valid starting point.
const STARTER_CODE = {
  python: `import sys\nprint(f"Python {sys.version}")\nprint("Hello from Executor")\n`,
  javascript: `const os = require('os');\nconsole.log(\`Node \${process.version}\`);\nconsole.log("Hello from Executor");\n`,
  go: `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello from Executor")\n}\n`,
  ruby: `puts RUBY_VERSION\nputs "Hello from Executor"\n`,
  java: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Executor");\n    }\n}\n`,
  c: `#include <stdio.h>\n\nint main() {\n    printf("Hello from Executor\\n");\n    return 0;\n}\n`,
  cpp: `#include <iostream>\n\nint main() {\n    std::cout << "Hello from Executor" << std::endl;\n    return 0;\n}\n`,
};

// Per-language notices displayed below the tab bar.
// Only set for languages with non-obvious constraints.
const LANG_NOTICES = {
  java: '⚠ Public class must be named Main',
};

// Monaco language id mapping (Monaco uses different ids than our internal ones)
const MONACO_LANG = {
  python: 'python',
  javascript: 'javascript',
  go: 'go',
  ruby: 'ruby',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
};

let editor = null;
let languages = [];       // Array of language descriptors from main process
let currentLangId = 'python';
let isRunning = false;

// Store per-language editor content so switching tabs doesn't erase user work
const editorContent = {};

require(['vs/editor/editor.main'], async () => {
  // Load language list from main process before building UI
  languages = await window.executor.getLanguages();

  // Initialize content store with starter templates
  languages.forEach(lang => {
    editorContent[lang.id] = STARTER_CODE[lang.id] || '';
  });

  // Build the language tab bar
  buildLangTabs();

  // Create Monaco editor
  editor = monaco.editor.create(document.getElementById('monaco-editor'), {
    value: editorContent[currentLangId],
    language: MONACO_LANG[currentLangId],
    theme: 'vs-dark',
    fontSize: 14,
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    lineNumbers: 'on',
    renderLineHighlight: 'line',
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'on',
    padding: { top: 12, bottom: 12 },
  });

  init();
});

// ---- Language tab bar ----

function buildLangTabs() {
  const container = document.getElementById('lang-tabs');
  languages.forEach(lang => {
    const tab = document.createElement('button');
    tab.className = 'lang-tab' + (lang.id === currentLangId ? ' active' : '');
    tab.textContent = lang.label;
    tab.dataset.langId = lang.id;
    tab.addEventListener('click', () => switchLanguage(lang.id));
    container.appendChild(tab);
  });
}

function switchLanguage(langId) {
  if (langId === currentLangId) return;

  // Save current editor content before switching
  if (editor) {
    editorContent[currentLangId] = editor.getValue();
  }

  currentLangId = langId;

  // Update tab active state
  document.querySelectorAll('.lang-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.langId === langId);
  });

  // Update Monaco language and content
  if (editor) {
    const model = editor.getModel();
    monaco.editor.setModelLanguage(model, MONACO_LANG[langId]);
    editor.setValue(editorContent[langId] || '');
  }

  // Update dep input visibility and labels
  updateDepInput(langId);

  // Update language notice
  const notice = document.getElementById('lang-notice');
  notice.textContent = LANG_NOTICES[langId] || '';
  notice.style.display = LANG_NOTICES[langId] ? 'block' : 'none';
}

function updateDepInput(langId) {
  const lang = languages.find(l => l.id === langId);
  const depRow = document.getElementById('dep-row');
  const depLabel = document.getElementById('dep-label');
  const depInput = document.getElementById('dep-input');

  if (lang && lang.hasDeps) {
    depRow.style.display = 'flex';
    depLabel.textContent = lang.depsLabel || 'packages';
    depInput.placeholder = lang.depsPlaceholder || '';
    depInput.value = '';
  } else {
    depRow.style.display = 'none';
    depInput.value = '';
  }
}

// ---- Main init ----

function init() {
  const runBtn = document.getElementById('run-btn');
  const clearBtn = document.getElementById('clear-btn');
  const depInput = document.getElementById('dep-input');

  // Apply initial dep input state
  updateDepInput(currentLangId);

  // Apply initial lang notice
  const notice = document.getElementById('lang-notice');
  notice.textContent = LANG_NOTICES[currentLangId] || '';
  notice.style.display = LANG_NOTICES[currentLangId] ? 'block' : 'none';

  // Register persistent IPC listeners
  window.executor.onOutputLine(({ line, type }) => appendLine(line, type));
  window.executor.onExecutionState(({ running }) => {
    isRunning = running;
    setRunningState(running);
  });

  // Run button
  runBtn.addEventListener('click', async () => {
    if (isRunning) return;
    const code = editor.getValue();
    if (!code.trim()) return;

    clearConsole();

    const deps = document.getElementById('dep-input').value.trim();
    const result = await window.executor.runCode(code, currentLangId, deps);
    if (result.error) {
      appendLine(`[executor] ${result.error}`, 'system');
    }
  });

  clearBtn.addEventListener('click', clearConsole);

  // Ctrl+Enter to run
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (!isRunning) runBtn.click();
    }
  });

  checkDocker();
}

// ---- Docker status ----

async function checkDocker() {
  const indicator = document.getElementById('docker-indicator');
  const label = document.getElementById('docker-label');
  const runBtn = document.getElementById('run-btn');

  const result = await window.executor.checkDocker();
  if (result.ok) {
    indicator.className = 'indicator ok';
    label.textContent = 'Docker connected';
    runBtn.disabled = false;
  } else {
    indicator.className = 'indicator error';
    label.textContent = 'Docker not available';
    runBtn.disabled = true;
    appendLine('[executor] Docker is not running or not installed.', 'system');
    appendLine('[executor] Start Docker Desktop and restart this application.', 'system');
  }
}

// ---- Console ----

function appendLine(text, type) {
  const output = document.getElementById('console-output');
  const line = document.createElement('div');
  line.className = `console-line ${type}`;
  line.textContent = text;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function clearConsole() {
  document.getElementById('console-output').innerHTML = '';
}

// ---- UI state ----

function setRunningState(running) {
  const runBtn = document.getElementById('run-btn');
  const depInput = document.getElementById('dep-input');

  runBtn.disabled = running;
  runBtn.textContent = running ? 'Running...' : 'Run';
  depInput.disabled = running;

  // Disable lang tabs during execution — switching mid-run is not allowed
  document.querySelectorAll('.lang-tab').forEach(tab => {
    tab.disabled = running;
  });

  if (editor) {
    editor.updateOptions({ readOnly: running });
  }
}
