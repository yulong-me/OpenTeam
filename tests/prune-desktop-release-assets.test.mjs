import assert from 'node:assert/strict';

import { assetsToDelete, shouldDeleteAsset } from '../scripts/prune-desktop-release-assets.mjs';

const releaseAssets = [
  'latest-mac.yml',
  'latest.yml',
  'OpenTeam-0.1.5-arm64-mac.zip',
  'OpenTeam-0.1.5-arm64-mac.zip.blockmap',
  'OpenTeam-0.1.5-arm64.dmg',
  'OpenTeam-0.1.5-arm64.dmg.blockmap',
  'OpenTeam-Setup-0.1.5.exe',
  'OpenTeam-Setup-0.1.5.exe.blockmap',
];

assert.deepEqual(
  assetsToDelete('darwin', releaseAssets).sort(),
  [
    'latest-mac.yml',
    'OpenTeam-0.1.5-arm64-mac.zip',
    'OpenTeam-0.1.5-arm64-mac.zip.blockmap',
    'OpenTeam-0.1.5-arm64.dmg.blockmap',
  ].sort(),
  'macOS pruning should delete updater metadata and keep the dmg installer',
);

assert.deepEqual(
  assetsToDelete('win32', releaseAssets).sort(),
  [
    'latest.yml',
    'OpenTeam-Setup-0.1.5.exe.blockmap',
  ].sort(),
  'Windows pruning should delete updater metadata and keep the NSIS installer',
);

assert.equal(shouldDeleteAsset('darwin', 'OpenTeam-0.1.5-arm64.dmg'), false);
assert.equal(shouldDeleteAsset('darwin', 'OpenTeam-Setup-0.1.5.exe'), false);
assert.equal(shouldDeleteAsset('win32', 'OpenTeam-Setup-0.1.5.exe'), false);
assert.equal(shouldDeleteAsset('win32', 'OpenTeam-0.1.5-arm64.dmg'), false);
assert.equal(shouldDeleteAsset('linux', 'latest.yml'), false);

console.log('prune-desktop-release-assets: ok');
