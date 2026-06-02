#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const version = process.env.DESKTOP_RELEASE_VERSION ?? packageJson.version;
const updateUrl = process.env.DESKTOP_UPDATE_URL;
const outputDir = resolve(root, process.env.DESKTOP_RELEASE_DIR ?? join('release', `mac-local-update-${version}`));
const tempDir = resolve(root, 'release', '.mac-local-update-build');

if (process.platform !== 'darwin') {
  throw new Error('macOS local update rehearsal builds must run on macOS.');
}

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`DESKTOP_RELEASE_VERSION must be semver: ${version}`);
}

if (!updateUrl || !/^https?:\/\//.test(updateUrl)) {
  throw new Error('DESKTOP_UPDATE_URL must be an http(s) URL, for example http://127.0.0.1:7333/');
}

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

function macAppDir() {
  const dir = resolve(outputDir, process.arch === 'arm64' ? 'mac-arm64' : 'mac');
  if (!existsSync(dir)) {
    throw new Error(`Expected packaged app directory to exist: ${dir}`);
  }
  return dir;
}

function writeLocalUpdateConfig(configPath) {
  writeFileSync(
    configPath,
    [
      'provider: generic',
      `url: ${updateUrl.endsWith('/') ? updateUrl : `${updateUrl}/`}`,
      'updaterCacheDirName: opencouncil-updater',
      '',
    ].join('\n'),
  );
}

function sha512Base64(filePath) {
  return createHash('sha512').update(readFileSync(filePath)).digest('base64');
}

function buildUpdaterZip(appDir) {
  const zipName = `OpenCouncil-${version}-${process.arch}-mac.zip`;
  const zipPath = resolve(outputDir, zipName);
  rmSync(zipPath, { force: true });
  rmSync(`${zipPath}.blockmap`, { force: true });

  run('ditto', [
    '-c',
    '-k',
    '--sequesterRsrc',
    '--keepParent',
    resolve(appDir, 'OpenCouncil.app'),
    zipPath,
  ]);

  const sha512 = sha512Base64(zipPath);
  const size = statSync(zipPath).size;
  const latestMacYml = [
    `version: ${version}`,
    'files:',
    `  - url: ${zipName}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${zipName}`,
    `sha512: ${sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
    '',
  ].join('\n');

  for (const channel of ['latest-mac.yml', 'alpha-mac.yml', 'beta-mac.yml']) {
    writeFileSync(resolve(outputDir, channel), latestMacYml);
  }
}

mkdirSync(tempDir, { recursive: true });
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const configPath = resolve(tempDir, `electron-builder-mac-local-${version}.json`);
const appUpdateConfigPath = resolve(tempDir, `app-update-${version}.yml`);
writeLocalUpdateConfig(appUpdateConfigPath);

const buildConfig = {
  ...packageJson.build,
  directories: {
    ...packageJson.build.directories,
    output: outputDir,
  },
  publish: [
    {
      provider: 'generic',
      url: updateUrl.endsWith('/') ? updateUrl : `${updateUrl}/`,
    },
  ],
  extraResources: [
    ...(packageJson.build.extraResources ?? []),
    {
      from: appUpdateConfigPath,
      to: 'app-update.yml',
    },
  ],
  extraMetadata: {
    ...packageJson.build.extraMetadata,
    version,
  },
  mac: {
    ...packageJson.build.mac,
    hardenedRuntime: false,
    identity: '-',
    notarize: false,
  },
};

writeFileSync(configPath, `${JSON.stringify(buildConfig, null, 2)}\n`);

run(pnpm, ['build']);
run(pnpm, ['run', 'desktop:rebuild-native']);

electronBuilder(['--dir', '--config', configPath, '--publish', 'never']);
electronBuilder(['--prepackaged', macAppDir(), '--mac', 'dmg', '--config', configPath, '--publish', 'never']);
buildUpdaterZip(macAppDir());

console.log(`macOS local update rehearsal artifacts created in ${outputDir}`);
