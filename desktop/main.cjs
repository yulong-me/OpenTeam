const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const isDev = !app.isPackaged;
const appRoot = isDev ? path.resolve(__dirname, '..') : path.join(process.resourcesPath, 'app');
let gatewayPort = Number(process.env.GATEWAY_PORT || 7000);
let backendPort = Number(process.env.BACKEND_PORT || 7001);
let frontendPort = Number(process.env.FRONTEND_PORT || 7002);

const children = new Set();
let mainWindow;
let quitting = false;

autoUpdater.autoDownload = true;

function resolveAppPath(...parts) {
  return path.join(appRoot, ...parts);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.connect(port, host);
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

async function waitForPort(port, label, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await portOpen(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not start on port ${port}`);
}

function findAvailablePort(preferredPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => {
      const fallback = net.createServer();
      fallback.unref();
      fallback.once('error', reject);
      fallback.listen(0, '127.0.0.1', () => {
        const address = fallback.address();
        fallback.close(() => resolve(address.port));
      });
    });
    server.listen(preferredPort, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
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

async function startRuntime() {
  const userData = app.getPath('userData');
  const runtimeRoot = path.join(userData, 'runtime');
  ensureDir(runtimeRoot);

  backendPort = await findAvailablePort(backendPort);
  frontendPort = await findAvailablePort(frontendPort);
  gatewayPort = await findAvailablePort(gatewayPort);

  const commonEnv = {
    NODE_ENV: 'production',
    OPENCOUNCIL_RUNTIME_ROOT: runtimeRoot,
    OPENCOUNCIL_BUILTIN_SKILLS_DIR: resolveAppPath('.agents', 'skills'),
  };

  spawnManaged('backend', process.execPath, [resolveAppPath('backend', 'dist', 'server.js')], {
    cwd: resolveAppPath('backend'),
    env: {
      ...commonEnv,
      PORT: String(backendPort),
    },
  });

  const frontendCommand = isDev
    ? resolveAppPath('frontend', 'node_modules', 'next', 'dist', 'bin', 'next')
    : resolveAppPath('frontend', '.next', 'standalone', 'server.js');
  const frontendArgs = isDev
    ? [frontendCommand, 'start', '-p', String(frontendPort)]
    : [frontendCommand];

  spawnManaged('frontend', process.execPath, frontendArgs, {
    cwd: isDev ? resolveAppPath('frontend') : resolveAppPath('frontend', '.next', 'standalone'),
    env: {
      ...commonEnv,
      PORT: String(frontendPort),
    },
  });

  await waitForPort(backendPort, 'Backend');
  await waitForPort(frontendPort, 'Frontend');

  spawnManaged('gateway', process.execPath, [resolveAppPath('scripts', 'gateway.mjs')], {
    cwd: appRoot,
    env: {
      ...commonEnv,
      GATEWAY_PORT: String(gatewayPort),
      BACKEND_PORT: String(backendPort),
      FRONTEND_PORT: String(frontendPort),
    },
  });

  await waitForPort(gatewayPort, 'Gateway');
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

  mainWindow.loadURL(`http://127.0.0.1:${gatewayPort}`);
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
