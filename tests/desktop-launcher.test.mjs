import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const mainSource = readFileSync(resolve(root, 'desktop/main.cjs'), 'utf8');
const expressProtocolSource = readFileSync(resolve(root, 'desktop/express-protocol.cjs'), 'utf8');
const backendAppSource = readFileSync(resolve(root, 'backend/src/app.ts'), 'utf8');
const backendServerSource = readFileSync(resolve(root, 'backend/src/server.ts'), 'utf8');
const rebuildSource = readFileSync(resolve(root, 'scripts/rebuild-desktop-native.mjs'), 'utf8');
const buildSource = readFileSync(resolve(root, 'scripts/build-desktop.mjs'), 'utf8');
const gatewaySource = readFileSync(resolve(root, 'scripts/gateway.mjs'), 'utf8');
const macLocalUpdateSource = readFileSync(resolve(root, 'scripts/build-mac-local-update.mjs'), 'utf8');
const prepareFrontendStandaloneSource = readFileSync(resolve(root, 'scripts/prepare-frontend-standalone.mjs'), 'utf8');
const updateFeedServerSource = readFileSync(resolve(root, 'scripts/serve-desktop-update-feed.mjs'), 'utf8');
const preflightSource = readFileSync(resolve(root, 'scripts/desktop-release-preflight.mjs'), 'utf8');
const verifyArtifactsSource = readFileSync(resolve(root, 'scripts/verify-desktop-artifacts.mjs'), 'utf8');
const verifySigningSource = readFileSync(resolve(root, 'scripts/verify-macos-signing.mjs'), 'utf8');
const verifyInstallabilitySource = readFileSync(resolve(root, 'scripts/verify-macos-installability.mjs'), 'utf8');
const configureSigningSource = readFileSync(resolve(root, 'scripts/configure-macos-signing-secrets.mjs'), 'utf8');
const releaseWorkflow = readFileSync(resolve(root, '.github/workflows/desktop-release.yml'), 'utf8');
const packageSource = readFileSync(resolve(root, 'package.json'), 'utf8');

assert.equal(packageJson.main, 'desktop/main.cjs');
assert.equal((packageSource.match(/"dependencies"\s*:/g) ?? []).length, 1, 'package.json must contain one dependencies field');
assert.equal(packageJson.scripts['desktop:rebuild-native'], 'node scripts/rebuild-desktop-native.mjs');
assert.equal(packageJson.scripts['desktop:preflight'], 'node scripts/desktop-release-preflight.mjs');
assert.equal(packageJson.scripts['desktop:prepare-frontend-standalone'], 'node scripts/prepare-frontend-standalone.mjs');
assert.equal(packageJson.scripts['desktop:verify-artifacts'], 'node scripts/verify-desktop-artifacts.mjs');
assert.equal(packageJson.scripts['desktop:verify-signing'], 'node scripts/verify-macos-signing.mjs');
assert.equal(packageJson.scripts['desktop:verify-installability'], 'node scripts/verify-macos-installability.mjs');
assert.equal(packageJson.scripts['desktop:configure-mac-signing'], 'node scripts/configure-macos-signing-secrets.mjs');
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
  repo: 'OpenTeam',
}]);
assert.deepEqual(packageJson.build.mac.target, ['dmg', 'zip']);
assert.equal(packageJson.build.win.target[0].target, 'nsis');
assert.deepEqual(packageJson.build.win.target[0].arch, ['x64']);
assert.equal(packageJson.build.nsis.oneClick, false);
assert.equal(packageJson.build.nsis.perMachine, false);
assert.equal(packageJson.build.generateUpdatesFilesForAllChannels, true);
assert.equal(packageJson.build.compression, 'normal');

assert.match(mainSource, /OPENTEAM_RUNTIME_ROOT/, 'desktop runtime must isolate mutable app data');
assert.match(mainSource, /OPENTEAM_BUILTIN_SKILLS_DIR/, 'desktop runtime must still find builtin agent skills');
assert.match(mainSource, /migrateLegacyUserData/, 'desktop runtime must migrate legacy user data into the OpenTeam profile');
assert.match(mainSource, /\['open', 'council'\]\.join\(''\)/, 'legacy profile migration must avoid reintroducing the old brand token');
assert.match(mainSource, /loadBackendApp/, 'desktop launcher must load the compiled backend inside the Electron main process');
assert.match(mainSource, /loadFrontendApp/, 'desktop launcher must load the frontend request handler inside the Electron main process');
assert.match(mainSource, /createExpressProtocolHandler/, 'desktop launcher must bridge the backend app through the Electron protocol handler');
assert.match(mainSource, /\/_next\/static\//, 'desktop launcher must serve Next static assets directly through the app protocol');
assert.match(mainSource, /safeJoin/, 'desktop launcher must guard static asset path traversal');
assert.match(mainSource, /__NEXT_PRIVATE_STANDALONE_CONFIG/, 'packaged desktop launcher must load Next standalone configuration before requiring next');
assert.doesNotMatch(mainSource, /spawnManaged\('backend'/, 'desktop launcher must not start a backend child process in stage 3 mode');
assert.doesNotMatch(mainSource, /spawnManaged\('frontend'/, 'desktop launcher must not start a frontend child process in stage 3 mode');
assert.doesNotMatch(mainSource, /function spawnManaged/, 'desktop launcher must not keep a child-service launcher in stage 3 mode');
assert.doesNotMatch(mainSource, /resolveAppPath\('backend', 'dist', 'server\.js'\)/, 'desktop launcher must not start the compiled backend server in stage 3 mode');
assert.doesNotMatch(mainSource, /BACKEND_SOCKET_PATH|backendSocketPath|backend\.sock|FRONTEND_SOCKET_PATH|frontendSocketPath|frontend\.sock/, 'desktop launcher must not configure frontend/backend sockets in stage 3 mode');
assert.doesNotMatch(mainSource, /frontend-socket-server\.cjs/, 'desktop launcher must not start a frontend socket server in stage 3 mode');
assert.match(mainSource, /resolveAppPath\('frontend', '\.next', 'standalone'\)/, 'packaged desktop launcher must load the Next standalone request handler');
assert.match(mainSource, /protocol\.registerSchemesAsPrivileged/, 'desktop launcher must register an internal API protocol');
assert.match(mainSource, /scheme: 'openteam-app'/, 'desktop launcher must load the frontend through a custom protocol');
assert.match(mainSource, /scheme: 'openteam-api'/, 'desktop launcher must expose backend API through a custom protocol');
assert.doesNotMatch(mainSource, /spawnManaged\('gateway'/, 'desktop launcher must not start the gateway process in stage 3 mode');
assert.doesNotMatch(mainSource, /resolveAppPath\('scripts', 'gateway\.mjs'\)/, 'desktop launcher must not package the gateway into the runtime path');
assert.doesNotMatch(mainSource, /findAvailablePort|waitForPort|portOpen/, 'desktop launcher must not probe or reserve TCP ports');
assert.doesNotMatch(mainSource, /FRONTEND_PORT|BACKEND_PORT|GATEWAY_PORT/, 'desktop launcher must not configure local TCP ports');
assert.doesNotMatch(mainSource, /ELECTRON_RUN_AS_NODE/, 'desktop launcher must not run app services as detached Node children in stage 3 mode');
assert.match(mainSource, /openteamApi/, 'desktop window must pass the internal API protocol to the frontend');
assert.match(mainSource, /openteam-app:\/\/local\//, 'desktop window must load the frontend through the app protocol');
assert.match(mainSource, /loadURL\(frontendUrl\.toString\(\)\)/, 'desktop window must load the frontend directly');
assert.match(mainSource, /titleBarStyle:\s*'hiddenInset'/, 'macOS desktop window must hide the native title bar so traffic lights integrate with the app chrome');
assert.match(mainSource, /trafficLightPosition:\s*\{\s*x:\s*24,\s*y:\s*24\s*\}/, 'macOS traffic lights must align with the app island spacing instead of floating in a separate title strip');
assert.match(mainSource, /mainWindow\.on\('closed'/, 'desktop launcher must clear destroyed window references');
assert.match(mainSource, /!mainWindow\.isDestroyed\(\)/, 'desktop launcher must not reuse destroyed windows');
assert.match(mainSource, /app\.on\('before-quit'/, 'desktop launcher must still track intentional app shutdown');
assert.match(mainSource, /process\.resourcesPath, 'app'/, 'packaged runtime must resolve files from the packaged app resources directory');
assert.match(mainSource, /require\('electron-updater'\)/, 'desktop launcher must load electron-updater');
assert.match(mainSource, /app-update\.yml/, 'desktop launcher must require published update metadata before checking');
assert.match(mainSource, /skipping update check/, 'desktop launcher must skip update checks for local unpacked builds');
assert.match(mainSource, /autoUpdater\.checkForUpdatesAndNotify\(\)/, 'desktop launcher must check for updates');
assert.match(mainSource, /autoUpdater\.autoDownload = true/, 'desktop updates should download in the background');
assert.match(mainSource, /update-downloaded/, 'desktop launcher must handle downloaded updates');
assert.match(mainSource, /dialog\.showMessageBox/, 'desktop launcher must prompt before restart update');
assert.match(mainSource, /showMessageBox\(mainWindow && !mainWindow\.isDestroyed\(\) \? mainWindow : undefined/, 'desktop update prompt must tolerate a closed main window');
assert.match(mainSource, /立即升级/, 'desktop update prompt must expose a clear upgrade action');
assert.match(mainSource, /autoUpdater\.quitAndInstall\(\)/, 'desktop launcher must install downloaded updates on confirmation');

assert.match(gatewaySource, /GATEWAY_HOST = process\.env\.GATEWAY_HOST \|\| '127\.0\.0\.1'/, 'gateway must default to loopback to match desktop port probing');
assert.match(gatewaySource, /server\.listen\(GATEWAY_PORT, GATEWAY_HOST/, 'gateway must not bind every local interface by default');
assert.match(expressProtocolSource, /createExpressProtocolHandler/, 'desktop must include a protocol adapter for in-process Express apps');
assert.match(expressProtocolSource, /new Response/, 'desktop protocol adapter must return Fetch API responses');
assert.match(backendAppSource, /export function createBackendApp/, 'backend app must be reusable without starting an HTTP listener');
assert.match(backendAppSource, /export function initializeBackendRuntime/, 'backend runtime initialization must be reusable by Electron');
assert.doesNotMatch(backendAppSource, /\.listen\(/, 'backend app module must not start a listener as an import side effect');
assert.doesNotMatch(backendServerSource, /BACKEND_SOCKET_PATH/, 'backend server must not need a desktop-only socket listener');
assert.match(backendServerSource, /BACKEND_HOST = process\.env\.BACKEND_HOST \|\| '127\.0\.0\.1'/, 'backend TCP mode must default to loopback');

assert.match(rebuildSource, /require\('electron\/package\.json'\)\.version/, 'native rebuild must target the installed Electron version');
assert.match(rebuildSource, /resolve\(root, 'backend'\)/, 'native rebuild must operate on backend dependencies');
assert.match(rebuildSource, /better-sqlite3/, 'native rebuild must include better-sqlite3');
assert.match(rebuildSource, /npm_execpath/, 'native rebuild must reuse the active pnpm entrypoint on Windows runners');
assert.match(rebuildSource, /result\.error/, 'native rebuild must report pnpm spawn failures');
assert.match(rebuildSource, /codesign/, 'native rebuild must ad-hoc sign rebuilt macOS native modules');
assert.match(rebuildSource, /better_sqlite3\.node/, 'native rebuild must sign the rebuilt better-sqlite3 binary');
assert.match(buildSource, /buildMacDistributables/, 'desktop build script must customize macOS artifact generation');
assert.match(buildSource, /npm_execpath/, 'desktop build script must reuse the active pnpm entrypoint on Windows runners');
assert.match(buildSource, /result\.error/, 'desktop build script must report pnpm spawn failures');
assert.match(buildSource, /macDryRunConfigPath/, 'desktop build script must isolate local dry-run macOS signing config');
assert.match(buildSource, /macPublishConfigPath/, 'desktop publish builds must use a macOS config that injects updater metadata');
assert.match(buildSource, /writeMacGithubUpdateConfig/, 'desktop build script must generate GitHub updater provider config');
assert.match(buildSource, /extraResources/, 'desktop build script must inject updater config before signing packaged apps');
assert.match(buildSource, /to: 'app-update\.yml'/, 'desktop build script must place updater config at app resources root');
assert.match(buildSource, /identity: null/, 'macOS dry-run builds must be unsigned instead of ad-hoc signed');
assert.match(buildSource, /hardenedRuntime: false/, 'macOS dry-run builds must not use hardened runtime without Developer ID signing');
assert.match(buildSource, /notarize: false/, 'macOS dry-run builds must not try notarization');
assert.match(buildSource, /desktop:preflight/, 'desktop build script must run release preflight');
assert.match(buildSource, /desktop:prepare-frontend-standalone/, 'desktop build script must prepare standalone frontend assets before packaging');
assert.match(buildSource, /DESKTOP_PUBLISH_MODE: publish/, 'desktop build script must pass publish mode to preflight');
assert.match(buildSource, /'mac-arm64' : 'mac', 'OpenTeam\.app'/, 'desktop build script must pass the real .app bundle to --prepackaged');
assert.doesNotMatch(buildSource, /Contents', 'Resources'[\s\S]*app-update\.yml/, 'desktop build script must not mutate signed macOS apps after packaging');
assert.match(buildSource, /electronBuilder\(\['--dir', \.\.\.configArgs, '--publish', publish\]\)/, 'desktop build script must create a prepackaged app with publish metadata before artifacts');
assert.match(buildSource, /buildMacDistributables\('always', macPublishConfigPath\(\)\)/, 'desktop publish builds must use the signed production macOS configuration');
assert.match(buildSource, /buildMacDistributables\('never', macDryRunConfigPath\(\)\)/, 'desktop dry-run builds must use the unsigned macOS configuration');
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
assert.match(macLocalUpdateSource, /'mac-arm64' : 'mac', 'OpenTeam\.app'/, 'macOS local update rehearsal must package the real .app bundle');
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
assert.match(verifySigningSource, /codesign/, 'macOS signing verifier must check the app signature');
assert.match(verifySigningSource, /Developer ID Application/, 'macOS signing verifier must require Developer ID Application signing');
assert.match(verifySigningSource, /stapler/, 'macOS signing verifier must validate notarization staple');
assert.match(verifySigningSource, /spctl/, 'macOS signing verifier must run Gatekeeper assessment');
assert.match(verifySigningSource, /hdiutil/, 'macOS signing verifier must verify dmg integrity');
assert.match(verifyInstallabilitySource, /hdiutil/, 'macOS installability verifier must mount the dmg');
assert.match(verifyInstallabilitySource, /attach/, 'macOS installability verifier must attach the dmg like a customer install');
assert.match(verifyInstallabilitySource, /detach/, 'macOS installability verifier must detach the mounted dmg');
assert.match(verifyInstallabilitySource, /ditto/, 'macOS installability verifier must copy the mounted app into a temporary install location');
assert.match(verifyInstallabilitySource, /codesign/, 'macOS installability verifier must verify copied app signature');
assert.match(verifyInstallabilitySource, /stapler/, 'macOS installability verifier must validate copied app notarization staple');
assert.match(verifyInstallabilitySource, /spctl/, 'macOS installability verifier must run Gatekeeper assessment on copied app');
assert.match(configureSigningSource, /MAC_CSC_LINK/, 'macOS signing setup must set the certificate secret');
assert.match(configureSigningSource, /APPLE_APP_SPECIFIC_PASSWORD/, 'macOS signing setup must set notarization credentials');
assert.match(configureSigningSource, /Developer ID Application/, 'macOS signing setup must require the right Apple certificate type');
assert.match(configureSigningSource, /'-legacy'/, 'macOS signing setup must export a Keychain-compatible legacy p12');
assert.match(configureSigningSource, /gh', \['secret', 'set'/, 'macOS signing setup must write GitHub Actions secrets');

assert.match(releaseWorkflow, /name: Desktop Release/, 'release workflow must exist');
assert.match(releaseWorkflow, /macos-latest/, 'release workflow must build macOS artifacts');
assert.match(releaseWorkflow, /windows-latest/, 'release workflow must build Windows artifacts');
assert.match(releaseWorkflow, /branches:\s*\n\s*- codex\/desktop-app\s*\n\s*- codex\/windows-client-packaging/, 'release workflow must package desktop artifacts when packaging branches are pushed');
assert.match(releaseWorkflow, /github\.ref_type == 'tag'/, 'release workflow must publish only for tag/manual release runs');
assert.match(releaseWorkflow, /pnpm desktop:publish/, 'release workflow must publish electron-builder artifacts');
assert.match(releaseWorkflow, /pnpm desktop:dist:local/, 'release workflow must support local artifact builds without publishing');
assert.match(releaseWorkflow, /pnpm run desktop:preflight/, 'release workflow must run release preflight');
assert.match(releaseWorkflow, /pnpm run desktop:verify-artifacts/, 'release workflow must verify desktop artifacts');
assert.match(releaseWorkflow, /pnpm run desktop:verify-signing/, 'release workflow must verify signed and notarized macOS artifacts');
assert.match(releaseWorkflow, /pnpm run desktop:verify-installability/, 'release workflow must verify signed dmg installability');
assert.match(releaseWorkflow, /DESKTOP_TARGET_PLATFORM: darwin/, 'release workflow must preflight macOS secrets');
assert.match(releaseWorkflow, /DESKTOP_TARGET_PLATFORM: win32/, 'release workflow must preflight Windows secrets');
assert.match(releaseWorkflow, /path: release\/OpenTeam-\*-arm64\.dmg/, 'branch macOS artifacts should upload only the installable dmg');
assert.doesNotMatch(releaseWorkflow, /release\/\*\.zip/, 'branch macOS artifact upload must not include updater zip files');
assert.match(releaseWorkflow, /name: desktop-windows/, 'branch Windows artifacts should upload under a distinct artifact name');
assert.match(releaseWorkflow, /release\/\*\.exe/, 'branch Windows artifacts should upload the NSIS installer');
assert.match(releaseWorkflow, /release\/latest\.yml/, 'branch Windows artifacts should upload update metadata');
assert.match(releaseWorkflow, /release\/\*\.blockmap/, 'branch Windows artifacts should upload blockmap metadata');
assert.match(releaseWorkflow, /CSC_LINK/, 'release workflow must support code signing certificates');
assert.match(releaseWorkflow, /APPLE_ID/, 'release workflow must support macOS notarization credentials');
assert.match(releaseWorkflow, /WIN_CSC_LINK/, 'release workflow must support Windows code signing certificates');
