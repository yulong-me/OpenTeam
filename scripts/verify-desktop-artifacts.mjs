#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const releaseDir = resolve(root, 'release');
const publishMode = process.env.DESKTOP_PUBLISH_MODE ?? 'never';
const platform = process.env.DESKTOP_TARGET_PLATFORM ?? process.platform;
const failures = [];

function requireFile(path, label) {
  if (!existsSync(path)) failures.push(`Missing ${label}: ${path}`);
}

function requirePattern(pattern, label) {
  const files = existsSync(releaseDir) ? readdirSync(releaseDir) : [];
  if (!files.some((file) => pattern.test(file))) failures.push(`Missing ${label} in ${releaseDir}`);
}

function requireUpdateMetadataAssets(metadataFile, label) {
  const metadataPath = resolve(releaseDir, metadataFile);
  if (!existsSync(metadataPath)) return;

  const metadata = readFileSync(metadataPath, 'utf8');
  const urls = [...metadata.matchAll(/url:\s*(.+)$/gm)].map((match) => match[1].trim());
  const pathMatch = metadata.match(/^path:\s*(.+)$/m);
  if (pathMatch) urls.push(pathMatch[1].trim());

  const uniqueUrls = [...new Set(urls)];
  if (uniqueUrls.length === 0) {
    failures.push(`${label} has no referenced update assets`);
    return;
  }

  for (const url of uniqueUrls) {
    if (/^https?:\/\//.test(url)) continue;
    requireFile(resolve(releaseDir, url), `${label} referenced asset`);
  }
}

if (platform === 'darwin') {
  requirePattern(/^OpenCouncil-.+\.dmg$/, 'macOS dmg installer');
  requirePattern(/^OpenCouncil-.+-mac\.zip$/, 'macOS zip updater artifact');
  requireFile(resolve(releaseDir, 'latest-mac.yml'), 'macOS update metadata');
  requireUpdateMetadataAssets('latest-mac.yml', 'macOS update metadata');

  if (publishMode === 'always') {
    const appUpdatePath = resolve(
      releaseDir,
      process.arch === 'arm64' ? 'mac-arm64' : 'mac',
      'OpenCouncil.app',
      'Contents',
      'Resources',
      'app-update.yml',
    );
    requireFile(appUpdatePath, 'macOS app update provider config');
  }
} else if (platform === 'win32') {
  requirePattern(/^OpenCouncil .+\.exe$|^OpenCouncil-.+\.exe$/, 'Windows NSIS installer');
  requireFile(resolve(releaseDir, 'latest.yml'), 'Windows update metadata');
  requireUpdateMetadataAssets('latest.yml', 'Windows update metadata');

  if (publishMode === 'always') {
    requireFile(
      resolve(releaseDir, 'win-unpacked', 'resources', 'app-update.yml'),
      'Windows app update provider config',
    );
  }
} else {
  failures.push(`Unsupported desktop artifact platform: ${platform}`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`desktop artifacts ok (${platform}, publish=${publishMode})`);
