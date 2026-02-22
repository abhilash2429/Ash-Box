/**
 * docker.js
 * Cross-platform Docker client configuration.
 */

const Docker = require('dockerode');
const os = require('os');

function getDockerSocketPath() {
  const platform = os.platform();
  if (platform === 'win32') {
    return '//./pipe/docker_engine';
  }
  return '/var/run/docker.sock';
}

function createDockerClient() {
  return new Docker({ socketPath: getDockerSocketPath() });
}

module.exports = { createDockerClient, getDockerSocketPath };
