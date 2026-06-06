#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');

export function isNativeBindingMismatch(error) {
  if (!error || typeof error !== 'object') return false;
  const message = String(error.message || '');
  return error.code === 'ERR_DLOPEN_FAILED'
    || message.includes('Could not locate the bindings file')
    || message.includes('was compiled against a different Node.js version')
    || message.includes('NODE_MODULE_VERSION');
}

function loadBetterSqliteModule() {
  return require('better-sqlite3');
}

function betterSqlitePackageDir() {
  return path.dirname(require.resolve('better-sqlite3/package.json'));
}

export function verifyBetterSqliteBinding(loadBetterSqlite = loadBetterSqliteModule) {
  const Database = loadBetterSqlite();
  const db = new Database(':memory:');
  db.close();
}

export function pnpmCommand(args, {
  npmExecPath = process.env.npm_execpath,
  nodePath = process.execPath,
  platform = process.platform,
} = {}) {
  if (npmExecPath?.includes('pnpm')) {
    return {
      command: nodePath,
      args: [npmExecPath, ...args],
    };
  }

  return {
    command: platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args,
  };
}

export function rebuildBetterSqlite() {
  rmSync(path.join(betterSqlitePackageDir(), 'build'), { recursive: true, force: true });

  const command = pnpmCommand(['rebuild', 'better-sqlite3']);
  const result = spawnSync(command.command, command.args, {
    cwd: backendDir,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(`Failed to start ${command.command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

export function ensureBetterSqlite({
  loadBetterSqlite = loadBetterSqliteModule,
  rebuildBetterSqlite: rebuild = rebuildBetterSqlite,
  logger = console,
} = {}) {
  try {
    verifyBetterSqliteBinding(loadBetterSqlite);
    return;
  } catch (error) {
    if (!isNativeBindingMismatch(error)) {
      throw error;
    }

    logger.warn('[native] better-sqlite3 ABI mismatch detected, rebuilding for current Node...');
    rebuild();
    verifyBetterSqliteBinding(loadBetterSqlite);
    logger.log('[native] better-sqlite3 ready');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ensureBetterSqlite();
}
