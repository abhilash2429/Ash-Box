'use strict';

const STARTER_CODE = {
  python: `import sys\nprint(f"Python {sys.version}")\nprint("Hello from Ash Box")\n`,
  javascript: `const os = require('os');\nconsole.log(\`Node \${process.version}\`);\nconsole.log("Hello from Ash Box");\n`,
  go: `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello from Ash Box")\n}\n`,
  ruby: `puts RUBY_VERSION\nputs "Hello from Ash Box"\n`,
  java: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Ash Box");\n    }\n}\n`,
  c: `#include <stdio.h>\n\nint main() {\n    printf("Hello from Ash Box\\n");\n    return 0;\n}\n`,
  cpp: `#include <iostream>\n\nint main() {\n    std::cout << "Hello from Ash Box" << std::endl;\n    return 0;\n}\n`,
};

const LANG_NOTICES = {
  java: 'Public class must be named Main',
};

const BRIDGE_URL = 'http://127.0.0.1:3876';
const DEFAULT_LANGUAGES = [
  { id: 'python', label: 'Python', hasDeps: true, depsLabel: 'pip packages', depsPlaceholder: 'e.g. requests numpy' },
  { id: 'javascript', label: 'JavaScript', hasDeps: true, depsLabel: 'npm packages', depsPlaceholder: 'e.g. axios lodash' },
  { id: 'go', label: 'Go', hasDeps: false, depsLabel: null, depsPlaceholder: null },
  { id: 'ruby', label: 'Ruby', hasDeps: true, depsLabel: 'gems', depsPlaceholder: 'e.g. httparty nokogiri' },
  { id: 'java', label: 'Java', hasDeps: false, depsLabel: null, depsPlaceholder: null },
  { id: 'c', label: 'C', hasDeps: false, depsLabel: null, depsPlaceholder: null },
  { id: 'cpp', label: 'C++', hasDeps: false, depsLabel: null, depsPlaceholder: null },
];

function createBridgeApi() {
  const outputListeners = [];
  const stateListeners = [];

  return {
    getLanguages: async () => {
      try {
        const response = await fetch(`${BRIDGE_URL}/languages`);
        if (!response.ok) throw new Error('language request failed');
        return await response.json();
      } catch (_) {
        return DEFAULT_LANGUAGES;
      }
    },
    checkDocker: async () => {
      try {
        const response = await fetch(`${BRIDGE_URL}/check-docker`);
        return await response.json();
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },
    runCode: async (code, languageId, dependencies) => {
      stateListeners.forEach(cb => cb({ running: true }));
      try {
        const response = await fetch(`${BRIDGE_URL}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, languageId, dependencies }),
        });
        const result = await response.json();
        if (Array.isArray(result.lines)) {
          result.lines.forEach(item => {
            outputListeners.forEach(cb => cb(item));
          });
        }
        return result;
      } catch (error) {
        return { error: error.message };
      } finally {
        stateListeners.forEach(cb => cb({ running: false }));
      }
    },
    onOutputLine: (callback) => outputListeners.push(callback),
    onExecutionState: (callback) => stateListeners.push(callback),
    removeAllListeners: () => {
      outputListeners.length = 0;
      stateListeners.length = 0;
    },
  };
}

const api = window.executor || createBridgeApi();

let languages = [];
let currentLangId = 'python';
let isRunning = false;
let isConsoleOpen = false;
const editorContent = {};

const app = document.getElementById('app');
const runBtn = document.getElementById('run-btn');
const clearBtn = document.getElementById('clear-btn');
const consoleToggle = document.getElementById('console-toggle');
const themeToggle = document.getElementById('theme-toggle');
const depInput = document.getElementById('dep-input');
const codeInput = document.getElementById('code-input');
const drawer = document.getElementById('console-drawer');

init();

async function init() {
  languages = await api.getLanguages();
  languages.forEach(lang => {
    editorContent[lang.id] = STARTER_CODE[lang.id] || '';
  });
  currentLangId = languages[0]?.id || 'python';
  codeInput.value = editorContent[currentLangId] || '';

  buildLangTabs();
  updateDepInput(currentLangId);
  updateLangNotice(currentLangId);
  loadTheme();

  api.onOutputLine(({ line, type }) => appendLine(line, type));
  api.onExecutionState(({ running }) => {
    isRunning = running;
    setRunningState(running);
  });

  runBtn.addEventListener('click', handleRun);
  clearBtn.addEventListener('click', clearConsole);
  consoleToggle.addEventListener('click', toggleConsole);
  themeToggle.addEventListener('click', toggleTheme);

  codeInput.addEventListener('input', () => {
    editorContent[currentLangId] = codeInput.value;
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !isRunning) {
      runBtn.click();
    }
  });

  checkDocker();
}

function buildLangTabs() {
  const container = document.getElementById('lang-tabs');
  container.innerHTML = '';

  languages.forEach(lang => {
    const tab = document.createElement('button');
    tab.className = 'lang-tab' + (lang.id === currentLangId ? ' active' : '');
    tab.textContent = lang.label;
    tab.dataset.langId = lang.id;
    tab.type = 'button';
    tab.addEventListener('click', () => switchLanguage(lang.id));
    container.appendChild(tab);
  });
}

function switchLanguage(langId) {
  if (langId === currentLangId) return;
  editorContent[currentLangId] = codeInput.value;
  currentLangId = langId;
  codeInput.value = editorContent[currentLangId] || '';

  document.querySelectorAll('.lang-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.langId === langId);
  });

  updateDepInput(langId);
  updateLangNotice(langId);
}

function updateDepInput(langId) {
  const lang = languages.find(item => item.id === langId);
  const row = document.getElementById('dep-row');
  const label = document.getElementById('dep-label');

  if (lang && lang.hasDeps) {
    row.style.display = 'flex';
    label.textContent = lang.depsLabel || 'Packages';
    depInput.placeholder = lang.depsPlaceholder || '';
  } else {
    row.style.display = 'none';
    depInput.value = '';
  }
}

function updateLangNotice(langId) {
  const notice = document.getElementById('lang-notice');
  const text = LANG_NOTICES[langId] || '';
  notice.textContent = text;
  notice.style.display = text ? 'block' : 'none';
}

async function handleRun() {
  if (isRunning) return;
  const code = codeInput.value;
  if (!code.trim()) return;

  clearConsole();
  openConsole();
  const dependencies = depInput.value.trim();
  const result = await api.runCode(code, currentLangId, dependencies);
  if (result?.error) {
    appendLine(`[executor] ${result.error}`, 'system');
  }
}

async function checkDocker() {
  const indicator = document.getElementById('docker-indicator');
  const label = document.getElementById('docker-label');
  const result = await api.checkDocker();

  if (result.ok) {
    indicator.className = 'indicator ok';
    label.textContent = 'Runtime connected';
    runBtn.disabled = false;
  } else {
    indicator.className = 'indicator error';
    label.textContent = 'Runtime unavailable';
    runBtn.disabled = true;
    appendLine('[executor] Docker is not available.', 'system');
    if (result.error) {
      appendLine(`[executor] ${result.error}`, 'system');
    }
    appendLine('[executor] Start Docker Desktop and bridge server for extension mode.', 'system');
  }
}

function appendLine(text, type) {
  const output = document.getElementById('console-output');
  const line = document.createElement('div');
  line.className = `console-line ${type || 'stdout'}`;
  line.textContent = text;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function clearConsole() {
  document.getElementById('console-output').innerHTML = '';
}

function setRunningState(running) {
  runBtn.disabled = running;
  runBtn.textContent = running ? 'Running...' : 'Run';
  depInput.disabled = running;
  codeInput.readOnly = running;

  document.querySelectorAll('.lang-tab').forEach(tab => {
    tab.disabled = running;
  });
}

function openConsole() {
  isConsoleOpen = true;
  drawer.classList.remove('hidden');
}

function closeConsole() {
  isConsoleOpen = false;
  drawer.classList.add('hidden');
}

function toggleConsole() {
  if (isConsoleOpen) closeConsole();
  else openConsole();
}

function loadTheme() {
  const saved = localStorage.getItem('ash-box-theme');
  const theme = saved === 'light' ? 'light' : 'dark';
  app.dataset.theme = theme;
  themeToggle.textContent = theme === 'dark' ? 'Light' : 'Dark';
}

function toggleTheme() {
  const nextTheme = app.dataset.theme === 'dark' ? 'light' : 'dark';
  app.dataset.theme = nextTheme;
  localStorage.setItem('ash-box-theme', nextTheme);
  themeToggle.textContent = nextTheme === 'dark' ? 'Light' : 'Dark';
}
