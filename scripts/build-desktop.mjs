#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const mode = process.argv[2] ?? 'pack';
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(`Failed to start ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

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

function runPnpm(args) {
  const command = pnpmCommand(args);
  run(command.command, command.args);
}

function electronBuilder(args) {
  runPnpm(['exec', 'electron-builder', ...args]);
}

function writeMacGithubUpdateConfig(path) {
  const publishTarget = packageJson.build.publish?.[0] ?? {};
  if (publishTarget.provider !== 'github' || !publishTarget.owner || !publishTarget.repo) {
    throw new Error('macOS updater config requires a GitHub publish target');
  }

  writeFileSync(path, [
    'provider: github',
    `owner: ${publishTarget.owner}`,
    `repo: ${publishTarget.repo}`,
    '',
  ].join('\n'));
}

function macConfigPath(name, overrides = {}) {
  const dir = resolve(root, 'release', '.desktop-build');
  mkdirSync(dir, { recursive: true });
  const appUpdateConfigPath = resolve(dir, `app-update-${name}.yml`);
  const configPath = resolve(dir, `electron-builder-mac-${name}.json`);
  writeMacGithubUpdateConfig(appUpdateConfigPath);
  writeFileSync(configPath, `${JSON.stringify({
    ...packageJson.build,
    extraResources: [
      ...(packageJson.build.extraResources ?? []),
      {
        from: appUpdateConfigPath,
        to: 'app-update.yml',
      },
    ],
    mac: {
      ...packageJson.build.mac,
      ...overrides.mac,
    },
  }, null, 2)}\n`);
  return configPath;
}

function macDryRunConfigPath() {
  return macConfigPath('dry-run', {
    mac: {
      hardenedRuntime: false,
      identity: null,
      notarize: false,
    },
  });
}

function macPublishConfigPath() {
  return macConfigPath('publish');
}

function buildRuntime() {
  runPnpm(['build']);
  runPnpm(['run', 'desktop:prepare-frontend-standalone']);
  runPnpm(['run', 'desktop:rebuild-native']);
}

function preflight(publish) {
  const platform = process.platform;
  const command = pnpmCommand(['run', 'desktop:preflight']);
  const result = spawnSync(command.command, command.args, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      DESKTOP_PUBLISH_MODE: publish,
      DESKTOP_TARGET_PLATFORM: platform,
    },
  });

  if (result.error) {
    console.error(`Failed to start ${command.command}: ${result.error.message}`);
    process.exit(1);
  }

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
    buildMacDistributables('always', macPublishConfigPath());
  } else if (process.platform === 'win32') {
    electronBuilder(['--win', '--x64', '--publish', 'always']);
  } else {
    throw new Error(`Desktop publishing is not configured for ${process.platform}`);
  }
} else {
  throw new Error(`Unknown desktop build mode: ${mode}`);
}
