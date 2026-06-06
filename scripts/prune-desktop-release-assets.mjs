#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const publishConfig = packageJson.build?.publish?.[0] ?? {};
const releaseRepo = `${publishConfig.owner}/${publishConfig.repo}`;

export function shouldDeleteAsset(platform, assetName) {
  if (platform === 'darwin') {
    return assetName === 'latest-mac.yml'
      || /-mac\.zip$/.test(assetName)
      || /-mac\.zip\.blockmap$/.test(assetName)
      || /\.dmg\.blockmap$/.test(assetName);
  }

  if (platform === 'win32') {
    return assetName === 'latest.yml'
      || /\.exe\.blockmap$/.test(assetName);
  }

  return false;
}

export function assetsToDelete(platform, assetNames) {
  return assetNames.filter((assetName) => shouldDeleteAsset(platform, assetName));
}

function releaseTag() {
  return process.env.GITHUB_REF_NAME || `v${packageJson.version}`;
}

function runGh(args, { capture = false } = {}) {
  const result = spawnSync('gh', args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`gh ${args.join(' ')} failed with exit code ${result.status}`);
  }

  return result.stdout ?? '';
}

export function pruneReleaseAssets({
  platform = process.env.DESKTOP_TARGET_PLATFORM || process.platform,
  tag = releaseTag(),
} = {}) {
  if (!releaseRepo || releaseRepo === 'undefined/undefined') {
    throw new Error('package.json build.publish must define the GitHub release owner and repo');
  }

  const assetOutput = runGh([
    'release',
    'view',
    tag,
    '--repo',
    releaseRepo,
    '--json',
    'assets',
    '--jq',
    '.assets[].name',
  ], { capture: true });

  const assetNames = assetOutput.split(/\r?\n/).filter(Boolean);
  const deletedAssetNames = assetsToDelete(platform, assetNames);

  for (const assetName of deletedAssetNames) {
    runGh(['release', 'delete-asset', tag, assetName, '--repo', releaseRepo, '-y']);
  }

  if (deletedAssetNames.length === 0) {
    console.log(`No ${platform} release metadata assets to prune from ${tag}.`);
    return;
  }

  console.log(`Pruned ${deletedAssetNames.length} ${platform} release metadata asset(s) from ${tag}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  pruneReleaseAssets();
}
