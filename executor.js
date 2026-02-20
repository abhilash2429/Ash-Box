/**
 * executor.js
 * Orchestrates Docker container lifecycle for a single code execution session.
 *
 * Responsibilities:
 * - Write user code to a temp input directory (mounted read-only into container)
 * - Create and start a Docker container
 * - Install dependencies and execute via per-language shell command
 * - Stream stdout/stderr back via callback
 * - Enforce timeout and resource limits
 * - Destroy container and clean workspace on completion
 *
 * Mount contract:
 *   workspaceDir → /input:ro   (user code, read-only)
 *   /workspace                 (container-native writable dir for build artifacts)
 */

const { createDockerClient } = require('./docker');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { LANGUAGES } = require('./languages');

const docker = createDockerClient();

const BASE_IMAGE = 'executor-base:latest';
const TIMEOUT_MS = 60_000;
const MEMORY_LIMIT_BYTES = 512 * 1024 * 1024;
const CPU_QUOTA = 100_000;
const CPU_PERIOD = 100_000;
const PIDS_LIMIT = 128; // Increased from 64: Java, npm, Ruby gems spawn more processes

/**
 * @param {string} code         - Source code to execute
 * @param {string} languageId   - Key from LANGUAGES registry
 * @param {string[]} dependencies - Package names to install before execution
 * @param {(line: string, type: 'stdout'|'stderr'|'system') => void} onLine
 * @returns {Promise<{ exitCode: number }>}
 */
async function runExecution(code, languageId, dependencies, onLine) {
  const lang = LANGUAGES[languageId];
  if (!lang) {
    onLine(`[executor] Unknown language: ${languageId}`, 'system');
    return { exitCode: 1 };
  }

  const sessionId = crypto.randomBytes(6).toString('hex');
  // This directory is mounted into the container as /input (read-only)
  const inputDir = path.join(os.tmpdir(), `executor-${sessionId}`);

  let container = null;
  let timeoutHandle = null;
  let timedOut = false;

  // Step 1: Write user code to input directory
  fs.mkdirSync(inputDir, { recursive: true });
  fs.writeFileSync(path.join(inputDir, lang.fileName), code, 'utf8');
  onLine(`[executor] Language: ${lang.label}`, 'system');

  if (dependencies.length > 0) {
    onLine(`[executor] Installing: ${dependencies.join(', ')}`, 'system');
  }

  // Step 2: Get shell command from language config
  const shellCmd = lang.buildCommand(dependencies);

  try {
    // Step 3: Verify base image exists
    try {
      await docker.getImage(BASE_IMAGE).inspect();
    } catch (_) {
      throw new Error(`Base image '${BASE_IMAGE}' not found. Run: node build-image.js`);
    }

    // Step 4: Create container
    // /input is read-only (user code cannot be modified by the script)
    // /workspace is a writable container-native dir (compilation output, node_modules, etc.)
    container = await docker.createContainer({
      Image: BASE_IMAGE,
      Cmd: ['sh', '-c', shellCmd],
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      WorkingDir: '/workspace',
      HostConfig: {
        Binds: [`${inputDir}:/input:ro`],
        Memory: MEMORY_LIMIT_BYTES,
        MemorySwap: MEMORY_LIMIT_BYTES,
        CpuPeriod: CPU_PERIOD,
        CpuQuota: CPU_QUOTA,
        PidsLimit: PIDS_LIMIT,
        NetworkMode: 'bridge',
        AutoRemove: false,
      },
      User: 'runner',
    });

    onLine('[executor] Container created', 'system');

    // Step 5: Attach to output stream before starting
    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });

    // Step 6: Demultiplex Docker's multiplexed stream
    // Format: 8-byte header per frame [type(1), 0, 0, 0, size(4 big-endian)]
    // type 1 = stdout, type 2 = stderr
    let buffer = Buffer.alloc(0);
    stream.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 8) {
        const streamType = buffer[0];
        const size = buffer.readUInt32BE(4);
        if (buffer.length < 8 + size) break;
        const payload = buffer.slice(8, 8 + size).toString('utf8');
        buffer = buffer.slice(8 + size);
        const type = streamType === 2 ? 'stderr' : 'stdout';
        payload.split('\n').forEach(line => {
          if (line.length > 0) onLine(line, type);
        });
      }
    });

    // Step 7: Start
    await container.start();
    onLine('[executor] Execution started', 'system');

    // Step 8: Enforce timeout
    const exitPromise = container.wait();
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(async () => {
        timedOut = true;
        try { await container.kill(); } catch (_) {}
        reject(new Error(`Execution exceeded ${TIMEOUT_MS / 1000}s timeout`));
      }, TIMEOUT_MS);
    });

    // Step 9: Wait for exit or timeout
    const result = await Promise.race([exitPromise, timeoutPromise]);
    clearTimeout(timeoutHandle);

    const exitCode = result?.StatusCode ?? 1;
    if (exitCode === 0) {
      onLine('[executor] Completed successfully', 'system');
    } else if (!timedOut) {
      onLine(`[executor] Exited with code ${exitCode}`, 'system');
    }

    return { exitCode };

  } catch (err) {
    clearTimeout(timeoutHandle);
    const prefix = timedOut ? 'TIMEOUT' : 'ERROR';
    onLine(`[executor] ${prefix}: ${err.message}`, 'system');
    return { exitCode: 1 };

  } finally {
    // Step 10: Always destroy container and input directory
    if (container) {
      try { await container.remove({ force: true }); } catch (_) {}
      onLine('[executor] Container destroyed', 'system');
    }
    try { fs.rmSync(inputDir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = { runExecution };
