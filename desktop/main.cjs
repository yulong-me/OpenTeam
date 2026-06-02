const { app, BrowserWindow, dialog, protocol } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const isDev = !app.isPackaged;
const appRoot = isDev ? path.resolve(__dirname, '..') : path.join(process.resourcesPath, 'app');
let backendSocketPath;
let frontendSocketPath;

const children = new Set();
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

function socketOpen(socketPath) {
  return new Promise((resolve) => {
    const socket = net.connect(socketPath);
    socket.setTimeout(250);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitForSocket(socketPath, label, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await socketOpen(socketPath)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not start on ${socketPath}`);
}

function spawnManaged(name, command, args, options = {}) {
  const proc = spawn(command, args, {
    cwd: options.cwd || appRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  children.add(proc);

  const write = (stream, chunk) => {
    const text = chunk.toString();
    for (const line of text.split('\n').filter(Boolean)) {
      stream.write(`[${name}] ${line}\n`);
    }
  };

  proc.stdout.on('data', (chunk) => write(process.stdout, chunk));
  proc.stderr.on('data', (chunk) => write(process.stderr, chunk));
  proc.on('exit', (code, signal) => {
    children.delete(proc);
    if (!quitting && code !== 0) {
      showStartupError(new Error(`${name} exited with ${signal || code}`));
    }
  });

  return proc;
}

function stopChildren() {
  quitting = true;
  for (const child of children) {
    if (!child.killed) child.kill();
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

function socketRequest(socketPath, request) {
  return new Promise(async (resolve) => {
    const url = new URL(request.url);
    const body = Buffer.from(await request.arrayBuffer());
    const headers = {};
    request.headers.forEach((value, key) => {
      if (!['host', 'connection', 'content-length'].includes(key.toLowerCase())) {
        headers[key] = value;
      }
    });
    if (body.length > 0) headers['content-length'] = String(body.length);

    const req = http.request(
      {
        socketPath,
        method: request.method,
        path: `${url.pathname}${url.search}`,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve(new Response(Buffer.concat(chunks), {
            status: res.statusCode || 502,
            statusText: res.statusMessage || undefined,
            headers: Object.fromEntries(
              Object.entries(res.headers)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value)]),
            ),
          }));
        });
      },
    );

    req.on('error', (error) => {
      resolve(new Response(`OpenCouncil backend unavailable: ${error.message}`, {
        status: 502,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }));
    });

    if (body.length > 0) req.write(body);
    req.end();
  });
}

function setupInternalApiProtocol() {
  protocol.handle('opencouncil-api', (request) => socketRequest(backendSocketPath, request));
  protocol.handle('opencouncil-app', (request) => socketRequest(frontendSocketPath, request));
}

async function startRuntime() {
  const userData = app.getPath('userData');
  const runtimeRoot = path.join(userData, 'runtime');
  const socketRoot = path.join(runtimeRoot, 'sockets');
  ensureDir(runtimeRoot);
  ensureDir(socketRoot);
  backendSocketPath = path.join(socketRoot, 'backend.sock');
  frontendSocketPath = path.join(socketRoot, 'frontend.sock');

  const commonEnv = {
    NODE_ENV: 'production',
    OPENCOUNCIL_RUNTIME_ROOT: runtimeRoot,
    OPENCOUNCIL_BUILTIN_SKILLS_DIR: resolveAppPath('.agents', 'skills'),
  };

  spawnManaged('backend', process.execPath, [resolveAppPath('backend', 'dist', 'server.js')], {
    cwd: resolveAppPath('backend'),
    env: {
      ...commonEnv,
      BACKEND_SOCKET_PATH: backendSocketPath,
    },
  });

  spawnManaged('frontend', process.execPath, [resolveAppPath('desktop', 'frontend-socket-server.cjs')], {
    cwd: isDev ? resolveAppPath('frontend') : resolveAppPath('frontend', '.next', 'standalone'),
    env: {
      ...commonEnv,
      FRONTEND_SOCKET_PATH: frontendSocketPath,
      NEXT_DIR: isDev ? resolveAppPath('frontend') : resolveAppPath('frontend', '.next', 'standalone'),
    },
  });

  await waitForSocket(backendSocketPath, 'Backend');
  await waitForSocket(frontendSocketPath, 'Frontend');
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

app.on('before-quit', stopChildren);

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
