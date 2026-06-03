#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const releaseDir = resolve(root, 'release');
const publishMode = process.env.DESKTOP_PUBLISH_MODE ?? 'never';
const platform = process.env.DESKTOP_TARGET_PLATFORM ?? process.platform;
const failures = [];

if (platform !== 'darwin') {
  console.log(`macOS signing verification skipped (${platform})`);
  process.exit(0);
}

if (publishMode !== 'always') {
  console.log(`macOS signing verification skipped (publish=${publishMode})`);
  process.exit(0);
}

const appDir = findAppDir();
const dmgFiles = existsSync(releaseDir)
  ? readdirSync(releaseDir).filter((file) => /^OpenTeam-.+\.dmg$/.test(file))
  : [];

if (dmgFiles.length === 0) {
  failures.push(`Missing signed dmg in ${releaseDir}`);
}

if (appDir) {
  requireCommand('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appDir], 'codesign verification');

  const signature = runCommand('codesign', ['--display', '--verbose=4', appDir]);
  if (signature.status !== 0) {
    failures.push(formatFailure('codesign display', signature));
  } else if (!/Authority=Developer ID Application:/.test(signature.output)) {
    failures.push(`App is not signed by a Developer ID Application certificate:\n${signature.output}`);
  }

  requireCommand('xcrun', ['stapler', 'validate', appDir], 'notarization staple validation');
  requireCommand('spctl', ['--assess', '--type', 'execute', '--verbose=4', appDir], 'Gatekeeper app assessment');
}

for (const dmg of dmgFiles) {
  requireCommand('hdiutil', ['verify', resolve(releaseDir, dmg)], `dmg integrity check (${dmg})`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('macOS signing ok');

function findAppDir() {
  const candidates = [
    resolve(releaseDir, process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'OpenTeam.app'),
    resolve(releaseDir, 'mac-arm64', 'OpenTeam.app'),
    resolve(releaseDir, 'mac', 'OpenTeam.app'),
  ];
  const appDir = candidates.find((candidate) => existsSync(candidate));
  if (!appDir) {
    failures.push(`Missing packaged OpenTeam.app in ${releaseDir}`);
    return null;
  }
  return appDir;
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
