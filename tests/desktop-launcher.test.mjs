import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const mainSource = readFileSync(resolve(root, 'desktop/main.cjs'), 'utf8');
const rebuildSource = readFileSync(resolve(root, 'scripts/rebuild-desktop-native.mjs'), 'utf8');
const buildSource = readFileSync(resolve(root, 'scripts/build-desktop.mjs'), 'utf8');
const macLocalUpdateSource = readFileSync(resolve(root, 'scripts/build-mac-local-update.mjs'), 'utf8');
const prepareFrontendStandaloneSource = readFileSync(resolve(root, 'scripts/prepare-frontend-standalone.mjs'), 'utf8');
const updateFeedServerSource = readFileSync(resolve(root, 'scripts/serve-desktop-update-feed.mjs'), 'utf8');
const preflightSource = readFileSync(resolve(root, 'scripts/desktop-release-preflight.mjs'), 'utf8');
const verifyArtifactsSource = readFileSync(resolve(root, 'scripts/verify-desktop-artifacts.mjs'), 'utf8');
const releaseWorkflow = readFileSync(resolve(root, '.github/workflows/desktop-release.yml'), 'utf8');
const releaseRunbook = readFileSync(resolve(root, 'docs/desktop-release-runbook.md'), 'utf8');
const packageSource = readFileSync(resolve(root, 'package.json'), 'utf8');

assert.equal(packageJson.main, 'desktop/main.cjs');
assert.equal((packageSource.match(/"dependencies"\s*:/g) ?? []).length, 1, 'package.json must contain one dependencies field');
assert.equal(packageJson.scripts['desktop:rebuild-native'], 'node scripts/rebuild-desktop-native.mjs');
assert.equal(packageJson.scripts['desktop:preflight'], 'node scripts/desktop-release-preflight.mjs');
assert.equal(packageJson.scripts['desktop:prepare-frontend-standalone'], 'node scripts/prepare-frontend-standalone.mjs');
assert.equal(packageJson.scripts['desktop:verify-artifacts'], 'node scripts/verify-desktop-artifacts.mjs');
assert.equal(packageJson.scripts['desktop:dev'], 'pnpm build && pnpm run desktop:rebuild-native && electron desktop/main.cjs');
assert.equal(packageJson.scripts['desktop:pack'], 'node scripts/build-desktop.mjs pack');
assert.equal(packageJson.scripts['desktop:dist'], 'node scripts/build-desktop.mjs dist-local');
assert.equal(packageJson.scripts['desktop:dist:local'], 'node scripts/build-desktop.mjs dist-local');
assert.equal(packageJson.scripts['desktop:dist:mac-local-update'], 'node scripts/build-mac-local-update.mjs');
assert.equal(packageJson.scripts['desktop:serve:mac-update'], 'node scripts/serve-desktop-update-feed.mjs');
assert.equal(packageJson.scripts['desktop:publish'], 'node scripts/build-desktop.mjs publish');
assert.ok(packageJson.devDependencies.electron, 'Electron must be installed for desktop runtime');
assert.ok(packageJson.devDependencies['electron-builder'], 'electron-builder must be installed for desktop packaging');
assert.ok(packageJson.dependencies['electron-updater'], 'electron-updater must be installed for app updates');
assert.ok(packageJson.devDependencies['@electron/rebuild'], 'Electron native module rebuild tooling must be installed');
assert.deepEqual(packageJson.build.publish, [{
  provider: 'github',
  owner: 'yulong-me',
  repo: 'OpenCouncil',
}]);
assert.deepEqual(packageJson.build.mac.target, ['dmg', 'zip']);
assert.equal(packageJson.build.win.target[0].target, 'nsis');
assert.deepEqual(packageJson.build.win.target[0].arch, ['x64']);
assert.equal(packageJson.build.nsis.oneClick, false);
assert.equal(packageJson.build.nsis.perMachine, false);
assert.equal(packageJson.build.generateUpdatesFilesForAllChannels, true);
assert.equal(packageJson.build.compression, 'normal');

assert.match(mainSource, /OPENCOUNCIL_RUNTIME_ROOT/, 'desktop runtime must isolate mutable app data');
assert.match(mainSource, /OPENCOUNCIL_BUILTIN_SKILLS_DIR/, 'desktop runtime must still find builtin agent skills');
assert.match(mainSource, /resolveAppPath\('backend', 'dist', 'server\.js'\)/, 'desktop launcher must start compiled backend');
assert.match(mainSource, /resolveAppPath\('frontend', 'node_modules', 'next', 'dist', 'bin', 'next'\)/, 'desktop launcher must start Next production server without shelling through pnpm');
assert.match(mainSource, /resolveAppPath\('frontend', '\.next', 'standalone', 'server\.js'\)/, 'packaged desktop launcher must start the Next standalone server');
assert.match(mainSource, /resolveAppPath\('scripts', 'gateway\.mjs'\)/, 'desktop launcher must reuse the single-port gateway');
assert.match(mainSource, /let gatewayPort = Number\(process\.env\.GATEWAY_PORT \|\| 7000\)/, 'desktop launcher must keep the public gateway default');
assert.match(mainSource, /let backendPort = Number\(process\.env\.BACKEND_PORT \|\| 7001\)/, 'desktop launcher must keep the backend default');
assert.match(mainSource, /let frontendPort = Number\(process\.env\.FRONTEND_PORT \|\| 7002\)/, 'desktop launcher must keep the frontend default');
assert.match(mainSource, /findAvailablePort\(gatewayPort\)/, 'desktop launcher must avoid gateway port collisions');
assert.match(mainSource, /loadURL\(`http:\/\/127\.0\.0\.1:\$\{gatewayPort\}`\)/, 'desktop window must load the gateway URL');
assert.match(mainSource, /app\.on\('before-quit'/, 'desktop launcher must clean up child processes on quit');
assert.match(mainSource, /ELECTRON_RUN_AS_NODE: '1'/, 'desktop child services must run under Node mode when spawned by Electron');
assert.match(mainSource, /process\.resourcesPath, 'app'/, 'packaged runtime must resolve files from the packaged app resources directory');
assert.match(mainSource, /require\('electron-updater'\)/, 'desktop launcher must load electron-updater');
assert.match(mainSource, /app-update\.yml/, 'desktop launcher must require published update metadata before checking');
assert.match(mainSource, /skipping update check/, 'desktop launcher must skip update checks for local unpacked builds');
assert.match(mainSource, /autoUpdater\.checkForUpdatesAndNotify\(\)/, 'desktop launcher must check for updates');
assert.match(mainSource, /autoUpdater\.autoDownload = true/, 'desktop updates should download in the background');
assert.match(mainSource, /update-downloaded/, 'desktop launcher must handle downloaded updates');
assert.match(mainSource, /dialog\.showMessageBox/, 'desktop launcher must prompt before restart update');
assert.match(mainSource, /立即升级/, 'desktop update prompt must expose a clear upgrade action');
assert.match(mainSource, /autoUpdater\.quitAndInstall\(\)/, 'desktop launcher must install downloaded updates on confirmation');

assert.match(rebuildSource, /require\('electron\/package\.json'\)\.version/, 'native rebuild must target the installed Electron version');
assert.match(rebuildSource, /resolve\(root, 'backend'\)/, 'native rebuild must operate on backend dependencies');
assert.match(rebuildSource, /better-sqlite3/, 'native rebuild must include better-sqlite3');
assert.match(buildSource, /buildMacDistributables/, 'desktop build script must customize macOS artifact generation');
assert.match(buildSource, /desktop:preflight/, 'desktop build script must run release preflight');
assert.match(buildSource, /desktop:prepare-frontend-standalone/, 'desktop build script must prepare standalone frontend assets before packaging');
assert.match(buildSource, /DESKTOP_PUBLISH_MODE: publish/, 'desktop build script must pass publish mode to preflight');
assert.doesNotMatch(buildSource, /writeFileSync\(.*app-update\.yml/s, 'desktop build script must not mutate signed macOS apps after packaging');
assert.match(buildSource, /electronBuilder\(\['--dir', '--publish', publish\]\)/, 'desktop build script must create a prepackaged app with publish metadata before artifacts');
assert.match(buildSource, /'--mac', 'dmg'/, 'desktop build script must build macOS dmg explicitly');
assert.match(buildSource, /'--mac', 'zip'/, 'desktop build script must build macOS zip explicitly for auto-update');
assert.ok(
  buildSource.indexOf("'--mac', 'dmg'") < buildSource.indexOf("'--mac', 'zip'"),
  'macOS dmg must be built before zip to avoid concurrent artifact packaging',
);
assert.match(buildSource, /'--win', '--x64', '--publish', 'always'/, 'desktop build script must publish Windows x64 artifacts');

assert.match(prepareFrontendStandaloneSource, /\.next', 'standalone'/, 'frontend standalone preparation must target the Next standalone directory');
assert.match(prepareFrontendStandaloneSource, /\.next', 'static'/, 'frontend standalone preparation must copy static assets');
assert.match(prepareFrontendStandaloneSource, /public/, 'frontend standalone preparation must copy public assets when present');
assert.ok(
  packageJson.build.files.includes('frontend/.next/standalone/**/*'),
  'desktop package must include only the standalone frontend runtime',
);
assert.ok(
  !packageJson.build.files.includes('frontend/node_modules/**/*'),
  'desktop package must not include full frontend node_modules',
);

assert.match(macLocalUpdateSource, /DESKTOP_RELEASE_VERSION/, 'macOS local update rehearsal must support explicit old and new versions');
assert.match(macLocalUpdateSource, /DESKTOP_UPDATE_URL/, 'macOS local update rehearsal must embed a local update feed URL');
assert.match(macLocalUpdateSource, /provider: 'generic'/, 'macOS local update rehearsal must use the generic update provider');
assert.match(macLocalUpdateSource, /app-update\.yml/, 'macOS local update rehearsal must package updater provider config into the app');
assert.match(macLocalUpdateSource, /extraResources/, 'macOS local update rehearsal must inject updater config before signing');
assert.doesNotMatch(macLocalUpdateSource, /Contents', 'Resources'[\s\S]*app-update\.yml/, 'macOS local update rehearsal must not mutate the signed app bundle');
assert.match(macLocalUpdateSource, /ditto/, 'macOS local update rehearsal must build the updater zip without relying on electron-builder zip task');
assert.match(macLocalUpdateSource, /latest-mac\.yml/, 'macOS local update rehearsal must write update metadata for the zip artifact');
assert.match(macLocalUpdateSource, /identity: '-'[,]/, 'macOS local update rehearsal must use ad-hoc signing without Apple signing credentials');
assert.match(macLocalUpdateSource, /hardenedRuntime: false/, 'macOS local update rehearsal must not require a hardened runtime entitlement setup');
assert.match(macLocalUpdateSource, /notarize: false/, 'macOS local update rehearsal must not require notarization credentials');
assert.match(updateFeedServerSource, /latest-mac\.yml/, 'macOS local update feed server must serve update metadata by default');
assert.match(updateFeedServerSource, /application\/zip/, 'macOS local update feed server must serve update zip artifacts');

assert.match(preflightSource, /GITHUB_REF_NAME === `v\$\{packageJson\.version\}`/, 'preflight must require tag and version alignment');
assert.match(preflightSource, /electron-updater/, 'preflight must require electron-updater as a production dependency');
assert.match(preflightSource, /APPLE_APP_SPECIFIC_PASSWORD/, 'preflight must check macOS notarization secrets');
assert.match(preflightSource, /DESKTOP_TARGET_PLATFORM/, 'preflight must support explicit target platform checks');
assert.match(verifyArtifactsSource, /latest-mac\.yml/, 'artifact verifier must require macOS update metadata');
assert.match(verifyArtifactsSource, /requireUpdateMetadataAssets/, 'artifact verifier must validate update metadata asset references');
assert.match(verifyArtifactsSource, /app-update\.yml/, 'artifact verifier must require macOS app updater config for published builds');
assert.match(verifyArtifactsSource, /latest\.yml/, 'artifact verifier must require Windows update metadata');
assert.match(verifyArtifactsSource, /Windows NSIS installer/, 'artifact verifier must require Windows NSIS installer');
assert.match(verifyArtifactsSource, /Windows app update provider config/, 'artifact verifier must require Windows app updater config for published builds');

assert.match(releaseWorkflow, /name: Desktop Release/, 'release workflow must exist');
assert.match(releaseWorkflow, /macos-latest/, 'release workflow must build macOS artifacts');
assert.doesNotMatch(releaseWorkflow, /windows-latest/, 'macOS release workflow must not be blocked by Windows packaging');
assert.match(releaseWorkflow, /branches:\s*\n\s*- codex\/desktop-app/, 'release workflow must package macOS artifacts when this branch is pushed');
assert.match(releaseWorkflow, /github\.ref_type == 'tag'/, 'release workflow must publish only for tag/manual release runs');
assert.match(releaseWorkflow, /pnpm desktop:publish/, 'release workflow must publish electron-builder artifacts');
assert.match(releaseWorkflow, /pnpm desktop:dist:local/, 'release workflow must support local artifact builds without publishing');
assert.match(releaseWorkflow, /pnpm run desktop:preflight/, 'release workflow must run release preflight');
assert.match(releaseWorkflow, /pnpm run desktop:verify-artifacts/, 'release workflow must verify desktop artifacts');
assert.match(releaseWorkflow, /DESKTOP_TARGET_PLATFORM: darwin/, 'release workflow must preflight macOS secrets');
assert.match(releaseWorkflow, /path: release\/OpenCouncil-\*-arm64\.dmg/, 'branch macOS artifacts should upload only the installable dmg');
assert.doesNotMatch(releaseWorkflow, /release\/\*\.zip/, 'branch macOS artifact upload must not include updater zip files');
assert.doesNotMatch(releaseWorkflow, /release\/\*\.yml/, 'branch macOS artifact upload must not include update metadata');
assert.match(releaseWorkflow, /CSC_LINK/, 'release workflow must support code signing certificates');
assert.match(releaseWorkflow, /APPLE_ID/, 'release workflow must support macOS notarization credentials');
assert.doesNotMatch(releaseWorkflow, /WIN_CSC_LINK/, 'macOS release workflow must not require Windows code signing certificates');

assert.match(releaseRunbook, /Update Rehearsal/, 'release runbook must include update rehearsal steps');
assert.match(releaseRunbook, /macOS Local Update Rehearsal/, 'release runbook must document local macOS update rehearsal');
assert.match(releaseRunbook, /立即升级/, 'release runbook must require the customer upgrade click path');
assert.match(releaseRunbook, /macOS only/, 'release runbook must document current macOS-only release scope');
assert.match(releaseRunbook, /publish=never/, 'release runbook must include dry-run workflow instructions');
