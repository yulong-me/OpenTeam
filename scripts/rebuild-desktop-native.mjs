#!/usr/bin/env node
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const electronVersion = require('electron/package.json').version;
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const result = spawnSync(pnpm, [
  'exec',
  'electron-rebuild',
  '--force',
  '--version',
  electronVersion,
  '--module-dir',
  resolve(root, 'backend'),
  '--which-module',
  'better-sqlite3',
], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
