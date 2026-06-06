#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const publishMode = process.env.DESKTOP_PUBLISH_MODE ?? 'never';
const platform = process.env.DESKTOP_TARGET_PLATFORM ?? process.platform;
const failures = [];

function requireField(condition, message) {
  if (!condition) failures.push(message);
}

function requireEnv(name) {
  requireField(Boolean(process.env[name]), `Missing required environment variable: ${name}`);
}

requireField(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(packageJson.version), 'package.json version must be semver');
requireField(packageJson.main === 'desktop/main.cjs', 'package.json main must point at desktop/main.cjs');
requireField(packageJson.dependencies?.['electron-updater'], 'electron-updater must be a production dependency');
requireField(packageJson.build?.publish?.[0]?.provider === 'github', 'electron-builder publish provider must be GitHub');
requireField(Boolean(packageJson.build?.publish?.[0]?.owner), 'electron-builder GitHub owner is required');
requireField(Boolean(packageJson.build?.publish?.[0]?.repo), 'electron-builder GitHub repo is required');
requireField(packageJson.build?.generateUpdatesFilesForAllChannels === true, 'update metadata generation must be enabled');

if (process.env.GITHUB_REF_TYPE === 'tag') {
  requireField(process.env.GITHUB_REF_NAME === `v${packageJson.version}`, `Git tag must match package version v${packageJson.version}`);
}

if (publishMode === 'always') {
  requireEnv('GH_TOKEN');

  if (platform === 'darwin') {
    requireEnv('CSC_LINK');
    requireEnv('CSC_KEY_PASSWORD');
    requireEnv('APPLE_ID');
    requireEnv('APPLE_APP_SPECIFIC_PASSWORD');
    requireEnv('APPLE_TEAM_ID');
  } else if (platform === 'win32') {
    if (process.env.CSC_LINK || process.env.CSC_KEY_PASSWORD) {
      requireEnv('CSC_LINK');
      requireEnv('CSC_KEY_PASSWORD');
    } else {
      console.warn('Windows publish builds are unsigned unless WIN_CSC_LINK is configured.');
    }
  } else {
    failures.push(`Unsupported desktop publish platform: ${platform}`);
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`desktop release preflight ok (${platform}, publish=${publishMode})`);
