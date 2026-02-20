/**
 * build-image.js
 * Run once before first use: node build-image.js
 * Builds the multi-runtime base Docker image used for all execution sessions.
 * This image includes: Python 3.11, Node.js 20, Go 1.22, Ruby, Java, gcc/g++
 *
 * Image build takes 3–8 minutes on first run depending on connection speed.
 * All subsequent runs reuse the cached image.
 */

const { createDockerClient } = require('./docker');
const path = require('path');

const docker = createDockerClient();
const IMAGE_TAG = 'executor-base:latest';

async function buildBaseImage() {
  console.log(`Building base image: ${IMAGE_TAG}`);
  console.log('Runtimes included: Python 3.11, Node.js 20, Go 1.22, Ruby, Java (OpenJDK), gcc/g++');
  console.log('This runs once. Expect 3–8 minutes on first build.\n');

  // Verify Docker is accessible before starting
  try {
    await docker.ping();
  } catch (err) {
    console.error('Cannot reach Docker daemon. Is Docker Desktop running?');
    process.exit(1);
  }

  const stream = await docker.buildImage(
    {
      context: path.join(__dirname),
      src: ['Dockerfile.base'],
    },
    {
      t: IMAGE_TAG,
      dockerfile: 'Dockerfile.base',
    }
  );

  await new Promise((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (err, output) => {
        if (err) return reject(err);
        resolve(output);
      },
      (event) => {
        if (event.stream) process.stdout.write(event.stream);
        if (event.error) console.error('Build error:', event.error);
      }
    );
  });

  console.log(`\nBase image built: ${IMAGE_TAG}`);
  console.log('Run the application: npm start');
}

buildBaseImage().catch(err => {
  console.error('\nBuild failed:', err.message);
  process.exit(1);
});
