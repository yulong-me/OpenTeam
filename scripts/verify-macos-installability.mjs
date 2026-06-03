#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const releaseDir = resolve(root, 'release');
const publishMode = process.env.DESKTOP_PUBLISH_MODE ?? 'never';
const platform = process.env.DESKTOP_TARGET_PLATFORM ?? process.platform;
const failures = [];

if (platform !== 'darwin') {
  console.log(`macOS installability verification skipped (${platform})`);
  process.exit(0);
}

if (publishMode !== 'always') {
  console.log(`macOS installability verification skipped (publish=${publishMode})`);
  process.exit(0);
}

const dmgPath = findDmg();
let tempRoot;
let mountDir;

try {
  tempRoot = mkdtempSync(join(tmpdir(), 'openteam-install-check-'));
  mountDir = join(tempRoot, 'mount');
  const installDir = join(tempRoot, 'Applications');
  const mountedApp = join(mountDir, 'OpenTeam.app');
  const installedApp = join(installDir, 'OpenTeam.app');

  requireCommand('hdiutil', ['attach', dmgPath, '-nobrowse', '-readonly', '-mountpoint', mountDir], 'dmg attach');

  if (!existsSync(mountedApp)) {
    failures.push(`Mounted dmg does not contain OpenTeam.app: ${mountedApp}`);
  } else {
    requireCommand('ditto', [mountedApp, installedApp], 'copy app from mounted dmg');

    if (existsSync(installedApp)) {
      requireCommand('xattr', ['-w', 'com.apple.quarantine', quarantineValue(), installedApp], 'apply quarantine marker');
      requireCommand('codesign', ['--verify', '--deep', '--strict', '--verbose=2', installedApp], 'installed app codesign verification');
      requireCommand('xcrun', ['stapler', 'validate', installedApp], 'installed app notarization staple validation');
      requireCommand('spctl', ['--assess', '--type', 'execute', '--verbose=4', installedApp], 'installed app Gatekeeper assessment');
    } else {
      failures.push(`App copy did not create expected install location: ${installedApp}`);
    }
  }
} finally {
  if (mountDir && existsSync(mountDir)) {
    const detach = runCommand('hdiutil', ['detach', mountDir]);
    if (detach.status !== 0) {
      failures.push(formatFailure('dmg detach', detach));
    }
  }

  if (tempRoot && existsSync(tempRoot)) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('macOS dmg installability ok');

function findDmg() {
  const dmgFiles = existsSync(releaseDir)
    ? readdirSync(releaseDir).filter((file) => /^OpenTeam-.+\.dmg$/.test(file))
    : [];

  if (dmgFiles.length !== 1) {
    failures.push(`Expected exactly one OpenTeam dmg in ${releaseDir}, found ${dmgFiles.length}`);
    return '';
  }

  return resolve(releaseDir, dmgFiles[0]);
}

function requireCommand(command, args, label) {
  const result = runCommand(command, args);
  if (result.status !== 0) {
    failures.push(formatFailure(label, result));
  }
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
  };
}

function formatFailure(label, result) {
  return `${label} failed${result.output ? `:\n${result.output}` : ''}`;
}

function quarantineValue() {
  const timestamp = Math.floor(Date.now() / 1000).toString(16);
  return `0081;${timestamp};GitHub Actions;https://github.com/yulong-me/OpenTeam`;
}
