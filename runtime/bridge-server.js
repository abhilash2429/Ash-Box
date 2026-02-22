'use strict';

const http = require('http');
const { URL } = require('url');
const { LANGUAGES } = require('./languages');
const { runExecution } = require('./executor');
const { createDockerClient } = require('./docker');

const PORT = Number(process.env.BRIDGE_PORT || 3876);
let isRunning = false;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

function sendJson(res, status, body) {
  setCors(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function parseDependencies(value) {
  return value
    .split(/[\s,]+/)
    .map(dep => dep.trim())
    .filter(Boolean);
}

function normalizeRunPayload(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const code = typeof data.code === 'string' ? data.code : '';
  const languageId = typeof data.languageId === 'string' ? data.languageId : '';
  const dependencies = typeof data.dependencies === 'string' ? data.dependencies : '';
  return { code, languageId, dependencies };
}

function isValidLanguageList(value) {
  return Array.isArray(value) && value.every(item => item && typeof item.id === 'string');
}

function probeExistingBridge(port) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/languages',
        timeout: 1200,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            resolve(false);
            return;
          }
          try {
            resolve(isValidLanguageList(JSON.parse(body)));
          } catch (_) {
            resolve(false);
          }
        });
      }
    );

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function checkDocker() {
  const docker = createDockerClient();
  try {
    await docker.ping();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/languages') {
    const list = Object.values(LANGUAGES).map(({ id, label, hasDeps, depsLabel, depsPlaceholder }) => ({
      id,
      label,
      hasDeps,
      depsLabel,
      depsPlaceholder,
    }));
    sendJson(res, 200, list);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/check-docker') {
    sendJson(res, 200, await checkDocker());
    return;
  }

  if (req.method === 'POST' && url.pathname === '/run') {
    if (isRunning) {
      sendJson(res, 409, { error: 'An execution is already in progress' });
      return;
    }

    let payload;
    try {
      const raw = await readBody(req);
      payload = JSON.parse(raw || '{}');
    } catch (error) {
      sendJson(res, 400, { error: `Invalid request: ${error.message}` });
      return;
    }

    const { code, languageId, dependencies: depsString } = normalizeRunPayload(payload);
    const dependencies = parseDependencies(depsString);

    if (!code.trim()) {
      sendJson(res, 400, { error: 'Code is required' });
      return;
    }

    isRunning = true;
    const lines = [];

    try {
      const result = await runExecution(code, languageId, dependencies, (line, type) => {
        lines.push({ line, type });
      });
      sendJson(res, 200, { exitCode: result.exitCode, lines });
    } catch (error) {
      sendJson(res, 500, { error: error.message, lines });
    } finally {
      isRunning = false;
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.on('error', async (error) => {
  if (error.code === 'EADDRINUSE') {
    const alreadyRunning = await probeExistingBridge(PORT);
    if (alreadyRunning) {
      console.log(`Bridge already running on http://127.0.0.1:${PORT}`);
      process.exit(0);
      return;
    }
    console.error(`Port ${PORT} is already in use.`);
    console.error('Stop the other process or use a different BRIDGE_PORT.');
    process.exit(1);
    return;
  }

  console.error(`Bridge failed to start: ${error.message}`);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Bridge listening on http://127.0.0.1:${PORT}`);
});
