#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const mode = process.argv[2] ?? 'pack';
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function electronBuilder(args) {
  run(pnpm, ['exec', 'electron-builder', ...args]);
}

function macDryRunConfigPath() {
  const dir = resolve(root, 'release', '.desktop-build');
  mkdirSync(dir, { recursive: true });
  const configPath = resolve(dir, 'electron-builder-mac-dry-run.json');
  writeFileSync(configPath, `${JSON.stringify({
    ...packageJson.build,
    mac: {
      ...packageJson.build.mac,
      hardenedRuntime: false,
      identity: null,
      notarize: false,
    },
  }, null, 2)}\n`);
  return configPath;
}

function buildRuntime() {
  run(pnpm, ['build']);
  run(pnpm, ['run', 'desktop:prepare-frontend-standalone']);
  run(pnpm, ['run', 'desktop:rebuild-native']);
}

function preflight(publish) {
  const platform = process.platform;
  const result = spawnSync(pnpm, ['run', 'desktop:preflight'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      DESKTOP_PUBLISH_MODE: publish,
      DESKTOP_TARGET_PLATFORM: platform,
    },
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function macAppDir() {
  const dir = resolve(root, 'release', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'OpenTeam.app');
  if (!existsSync(dir)) {
    throw new Error(`Expected packaged app bundle to exist: ${dir}`);
  }
  return dir;
}

function buildMacDistributables(publish, configPath) {
  const configArgs = configPath ? ['--config', configPath] : [];
  electronBuilder(['--dir', ...configArgs, '--publish', publish]);
  const appDir = macAppDir();
  electronBuilder(['--prepackaged', appDir, '--mac', 'dmg', ...configArgs, '--publish', publish]);
  electronBuilder(['--prepackaged', appDir, '--mac', 'zip', ...configArgs, '--publish', publish]);
}

if (mode === 'pack') {
  preflight('never');
  buildRuntime();
  electronBuilder(['--dir', '--config', macDryRunConfigPath()]);
} else if (mode === 'dist-local') {
  preflight('never');
  buildRuntime();
  if (process.platform === 'darwin') {
    buildMacDistributables('never', macDryRunConfigPath());
  } else if (process.platform === 'win32') {
    electronBuilder(['--win', '--x64', '--publish', 'never']);
  } else {
    throw new Error(`Desktop distribution is not configured for ${process.platform}`);
  }
} else if (mode === 'publish') {
  preflight('always');
  buildRuntime();
  if (process.platform === 'darwin') {
    buildMacDistributables('always');
  } else if (process.platform === 'win32') {
    electronBuilder(['--win', '--x64', '--publish', 'always']);
  } else {
    throw new Error(`Desktop publishing is not configured for ${process.platform}`);
  }
} else {
  throw new Error(`Unknown desktop build mode: ${mode}`);
}
