#!/usr/bin/env node
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const electronVersion = require('electron/package.json').version;

function pnpmCommand(args) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath?.includes('pnpm')) {
    return {
      command: process.execPath,
      args: [npmExecPath, ...args],
    };
  }

  return {
    command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args,
  };
}

const command = pnpmCommand([
  'exec',
  'electron-rebuild',
  '--force',
  '--version',
  electronVersion,
  '--module-dir',
  resolve(root, 'backend'),
  '--which-module',
  'better-sqlite3',
]);

const result = spawnSync(command.command, command.args, {
  cwd: root,
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

if (process.platform === 'darwin') {
  const nativeModulePath = resolve(
    root,
    'backend',
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node',
  );
  if (existsSync(nativeModulePath)) {
    const signResult = spawnSync('codesign', ['--force', '--sign', '-', nativeModulePath], {
      cwd: root,
      stdio: 'inherit',
    });
    if (signResult.error) {
      console.error(`Failed to start codesign: ${signResult.error.message}`);
      process.exit(1);
    }
    if (signResult.status !== 0) {
      process.exit(signResult.status ?? 1);
    }
  }
}
