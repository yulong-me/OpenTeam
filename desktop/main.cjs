const { app, BrowserWindow, dialog, protocol } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createExpressProtocolHandler } = require('./express-protocol.cjs');

const isDev = !app.isPackaged;
const appRoot = isDev ? path.resolve(__dirname, '..') : path.join(process.resourcesPath, 'app');
let backendProtocolHandler;
let frontendProtocolHandler;
let mainWindow;
let quitting = false;

autoUpdater.autoDownload = true;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'opencouncil-app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
  {
    scheme: 'opencouncil-api',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function resolveAppPath(...parts) {
  return path.join(appRoot, ...parts);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js' || ext === '.mjs') return 'application/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.ico') return 'image/x-icon';
  if (ext === '.woff') return 'font/woff';
  if (ext === '.woff2') return 'font/woff2';
  return 'application/octet-stream';
}

function safeJoin(root, relativePath) {
  const normalized = path.normalize(relativePath);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) return null;
  return path.join(root, normalized);
}

async function staticFileResponse(filePath) {
  try {
    const body = await fs.promises.readFile(filePath);
    return new Response(body, {
      headers: {
        'content-type': contentTypeFor(filePath),
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}

function showStartupError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <main style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 32px; line-height: 1.5;">
        <h1>OpenCouncil could not start</h1>
        <p>${message}</p>
      </main>
    `)}`);
  } else {
    dialog.showErrorBox('OpenCouncil could not start', message);
  }
}

function setupInternalApiProtocol() {
  protocol.handle('opencouncil-api', (request) => {
    if (!backendProtocolHandler) {
      return new Response('OpenCouncil backend is not ready', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    return backendProtocolHandler(request);
  });
  protocol.handle('opencouncil-app', (request) => {
    if (!frontendProtocolHandler) {
      return new Response('OpenCouncil frontend is not ready', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    return frontendProtocolHandler(request);
  });
}

async function loadBackendApp(commonEnv) {
  Object.assign(process.env, commonEnv);
  const backendModuleUrl = pathToFileURL(resolveAppPath('backend', 'dist', 'app.js')).href;
  const backend = await import(backendModuleUrl);
  backend.initializeBackendRuntime();
  backend.initNoopSocketEmitter();
  return backend.createBackendApp();
}

async function loadFrontendApp() {
  const nextDir = isDev ? resolveAppPath('frontend') : resolveAppPath('frontend', '.next', 'standalone');
  const staticRoot = isDev ? resolveAppPath('frontend', '.next', 'static') : resolveAppPath('frontend', '.next', 'standalone', '.next', 'static');
  const nextRequire = createRequire(`${nextDir}/package.json`);
  let nextConfig;
  if (!isDev) {
    const requiredServerFiles = nextRequire('./.next/required-server-files.json');
    nextConfig = requiredServerFiles.config;
    process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig);
  }
  const next = nextRequire('next');
  const nextApp = next({
    dev: false,
    dir: nextDir,
    ...(nextConfig ? { conf: nextConfig } : {}),
  });
  await nextApp.prepare();
  const handle = nextApp.getRequestHandler();
  const nextHandler = createExpressProtocolHandler((req, res) => handle(req, res));

  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/_next/static/')) {
      const relativePath = decodeURIComponent(url.pathname.slice('/_next/static/'.length));
      const filePath = safeJoin(staticRoot, relativePath);
      if (!filePath) {
        return new Response('Not found', {
          status: 404,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      return staticFileResponse(filePath);
    }
    return nextHandler(request);
  };
}

async function startRuntime() {
  const userData = app.getPath('userData');
  const runtimeRoot = path.join(userData, 'runtime');
  ensureDir(runtimeRoot);

  const commonEnv = {
    NODE_ENV: 'production',
    OPENCOUNCIL_RUNTIME_ROOT: runtimeRoot,
    OPENCOUNCIL_BUILTIN_SKILLS_DIR: resolveAppPath('.agents', 'skills'),
  };

  const backendApp = await loadBackendApp(commonEnv);
  backendProtocolHandler = createExpressProtocolHandler(backendApp);
  frontendProtocolHandler = await loadFrontendApp();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: `OpenCouncil ${app.getVersion()}`,
    backgroundColor: '#f7f4ef',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const frontendUrl = new URL('opencouncil-app://local/');
  frontendUrl.searchParams.set('opencouncilApi', 'opencouncil-api://local');
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer] failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error(`[renderer] ${message} (${sourceId}:${line})`);
    }
  });
  mainWindow.loadURL(frontendUrl.toString());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupAutoUpdates() {
  if (isDev) return;
  const updateConfigPath = path.join(process.resourcesPath, 'app-update.yml');
  if (!fs.existsSync(updateConfigPath)) {
    console.log('[updater] app-update.yml not found; skipping update check');
    return;
  }

  autoUpdater.on('error', (error) => {
    console.error(`[updater] ${error instanceof Error ? error.stack || error.message : String(error)}`);
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[updater] download ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on('update-downloaded', async () => {
    const result = await dialog.showMessageBox(mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined, {
      type: 'info',
      buttons: ['立即升级', '稍后'],
      defaultId: 0,
      cancelId: 1,
      title: '更新已就绪',
      message: '新版 OpenCouncil 已下载完成。',
      detail: '重启应用后将自动完成升级。',
    });

    if (result.response === 0) {
      quitting = true;
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    console.error(`[updater] ${error instanceof Error ? error.stack || error.message : String(error)}`);
  });
}

app.on('before-quit', () => {
  quitting = true;
});

app.whenReady().then(async () => {
  try {
    setupInternalApiProtocol();
    await startRuntime();
    createWindow();
    setupAutoUpdates();
  } catch (error) {
    showStartupError(error);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    } else {
      createWindow();
    }
  }
});
