/**
 * languages.js
 * Single source of truth for all supported languages.
 *
 * Each entry defines:
 * - id:              internal key
 * - label:           display name in UI
 * - monacoLanguage:  Monaco editor language identifier
 * - fileName:        name of the script file written into /input
 * - hasDeps:         whether the language supports runtime dependency installation
 * - depsLabel:       label shown next to the dependency input
 * - depsPlaceholder: placeholder text for the dependency input
 * - buildCommand:    function(deps: string[]) => string
 *                    Returns a single shell command (sh -c compatible) that:
 *                    1. Copies source from /input into /workspace
 *                    2. Installs dependencies (if any)
 *                    3. Compiles (if needed)
 *                    4. Executes the program
 *
 * Mount contract:
 *   /input/[fileName] = user code, read-only
 *   /workspace        = writable working directory (compilation output, node_modules, etc.)
 */

'use strict';

const LANGUAGES = {

  python: {
    id: 'python',
    label: 'Python',
    monacoLanguage: 'python',
    fileName: 'script.py',
    hasDeps: true,
    depsLabel: 'pip packages',
    depsPlaceholder: 'e.g. requests langchain numpy',
    buildCommand(deps) {
      const install = deps.length > 0
        ? `pip install --quiet ${deps.map(d => `"${d}"`).join(' ')} && `
        : '';
      return `cp /input/script.py . && ${install}python script.py`;
    },
  },

  javascript: {
    id: 'javascript',
    label: 'JavaScript',
    monacoLanguage: 'javascript',
    fileName: 'script.js',
    hasDeps: true,
    depsLabel: 'npm packages',
    depsPlaceholder: 'e.g. axios lodash dayjs',
    buildCommand(deps) {
      const install = deps.length > 0
        ? `npm install --silent ${deps.join(' ')} && `
        : '';
      return `cp /input/script.js . && ${install}node script.js`;
    },
  },

  go: {
    id: 'go',
    label: 'Go',
    monacoLanguage: 'go',
    fileName: 'script.go',
    hasDeps: false,
    depsLabel: null,
    depsPlaceholder: null,
    buildCommand(_deps) {
      // stdlib only — no go.mod needed for go run with no external imports
      return `cp /input/script.go . && go run script.go`;
    },
  },

  ruby: {
    id: 'ruby',
    label: 'Ruby',
    monacoLanguage: 'ruby',
    fileName: 'script.rb',
    hasDeps: true,
    depsLabel: 'gems',
    depsPlaceholder: 'e.g. httparty nokogiri',
    buildCommand(deps) {
      const install = deps.length > 0
        ? `gem install --silent ${deps.join(' ')} && `
        : '';
      return `cp /input/script.rb . && ${install}ruby script.rb`;
    },
  },

  java: {
    id: 'java',
    label: 'Java',
    monacoLanguage: 'java',
    fileName: 'Main.java',
    hasDeps: false,
    depsLabel: null,
    depsPlaceholder: null,
    buildCommand(_deps) {
      // Public class must be named Main — enforced by convention, documented in UI.
      return `cp /input/Main.java . && javac Main.java && java Main`;
    },
  },

  c: {
    id: 'c',
    label: 'C',
    monacoLanguage: 'c',
    fileName: 'script.c',
    hasDeps: false,
    depsLabel: null,
    depsPlaceholder: null,
    buildCommand(_deps) {
      return `cp /input/script.c . && gcc script.c -o prog -lm && ./prog`;
    },
  },

  cpp: {
    id: 'cpp',
    label: 'C++',
    monacoLanguage: 'cpp',
    fileName: 'script.cpp',
    hasDeps: false,
    depsLabel: null,
    depsPlaceholder: null,
    buildCommand(_deps) {
      return `cp /input/script.cpp . && g++ script.cpp -o prog -lm && ./prog`;
    },
  },

};

module.exports = { LANGUAGES };
