#!/usr/bin/env node
/**
 * Open a public tunnel to the local API and write its URL into apps/api/.env.
 *
 * Cursor cloud agents run on Cursor's infrastructure, not on this machine, so
 * two things they need — the uploaded dataset and the question channel — have
 * to be reachable from the internet. Without a tunnel a run still works, but
 * the agent cannot download the data or ask anything, so it falls back to its
 * own assumptions.
 *
 * Usage:
 *   npm run tunnel            # start a tunnel, patch .env, wait
 *   npm run tunnel -- --port 3000
 */

import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(here, '../apps/api/.env');

const NGROK_API = 'http://127.0.0.1:4040/api/tunnels';
const TUNNEL_READY_TIMEOUT_MS = 25_000;

function parseArgs(argv) {
  const port = argv.indexOf('--port');
  return { port: port === -1 ? '3000' : argv[port + 1] };
}

async function publicUrl() {
  const response = await fetch(NGROK_API);
  if (!response.ok) throw new Error(`ngrok API returned ${response.status}`);
  const body = await response.json();
  const tunnel = body.tunnels?.find((entry) => entry.proto === 'https');
  if (!tunnel) throw new Error('ngrok is up but has no https tunnel yet');
  return tunnel.public_url;
}

/** ngrok's local API only answers once the tunnel is actually established. */
async function waitForUrl() {
  const deadline = Date.now() + TUNNEL_READY_TIMEOUT_MS;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await publicUrl();
    } catch (cause) {
      lastError = cause;
      await new Promise((done) => setTimeout(done, 500));
    }
  }
  throw new Error(`Tunnel did not come up in time: ${lastError?.message}`);
}

async function patchEnv(url) {
  if (!existsSync(ENV_PATH)) {
    console.error(`No .env at ${ENV_PATH}. Copy .env.example first.`);
    return;
  }
  const current = await readFile(ENV_PATH, 'utf8');
  const line = `PUBLIC_BASE_URL=${url}`;
  const next = /^PUBLIC_BASE_URL=.*$/m.test(current)
    ? current.replace(/^PUBLIC_BASE_URL=.*$/m, line)
    : `${current.trimEnd()}\n${line}\n`;
  await writeFile(ENV_PATH, next, 'utf8');
  console.log(`Wrote ${line} to apps/api/.env`);
}

async function main() {
  const { port } = parseArgs(process.argv.slice(2));

  const ngrok = spawn('ngrok', ['http', port, '--log', 'stdout'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  ngrok.on('error', (cause) => {
    if (cause.code === 'ENOENT') {
      console.error(
        'ngrok is not installed. Install it with `brew install ngrok`, then\n' +
          'authenticate once with `ngrok config add-authtoken <token>`.',
      );
      process.exit(1);
    }
    throw cause;
  });

  // ngrok's own log is noisy and duplicates what we print below.
  ngrok.stdout.resume();

  const shutdown = () => {
    ngrok.kill('SIGTERM');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const url = await waitForUrl();
  await patchEnv(url);

  console.log('');
  console.log(`  Public API   ${url}`);
  console.log(`  MCP endpoint ${url}/mcp/<run token>`);
  console.log('');
  console.log('  Restart the API so it picks up the new PUBLIC_BASE_URL.');
  console.log('  Ctrl-C closes the tunnel.');

  ngrok.on('exit', (code) => process.exit(code ?? 0));
}

await main();
