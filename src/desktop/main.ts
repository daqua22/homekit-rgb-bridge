import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  Tray,
  shell,
  powerMonitor,
  type IpcMainInvokeEvent,
} from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { z } from 'zod';
import {
  dataDirectory,
  loadConfig,
  readJSON,
} from '../config/config-manager.js';
import { startDesktopService } from './service.js';
import { Logger } from '../utils/logger.js';
import { setStartup, startupEnabled } from '../windows/startup.js';
import {
  loadDesktopSettings,
  saveDesktopSettings,
  profileCandidates,
  findOpenRGB,
  openRGBArguments,
  trustedDesktopFrame,
} from './settings.js';

app.setName('HomeKit RGB Bridge');
app.setAppUserModelId('dev.kozar.homekit-rgb-bridge');
const argument = (key: string) => {
  const i = process.argv.indexOf(key);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const desktopDir = resolve(
  argument('--desktop-data-dir') ?? app.getPath('userData'),
);
mkdirSync(desktopDir, { recursive: true, mode: 0o700 });
app.setPath('userData', desktopDir);
const desktopLogger = new Logger('info', desktopDir);
const preferences = loadDesktopSettings(
  desktopDir,
  argument('--data-dir') ?? dataDirectory(),
);
if (!preferences.openRGBPath && process.platform === 'win32')
  preferences.openRGBPath = findOpenRGB();
let runtime: Awaited<ReturnType<typeof startDesktopService>>;
let window: BrowserWindow | undefined;
let tray: Tray | undefined;
let quitting = false;
let stopped = false;
let launchingRGB = false;
const loginOptions = { path: process.execPath, args: ['--hidden'] };
const loginEnabled = () => {
  if (process.platform !== 'win32') return false;
  const login = app.getLoginItemSettings(loginOptions);
  return login.openAtLogin && login.executableWillLaunchAtLogin;
};
const setLogin = (enabled: boolean) => {
  if (process.platform !== 'win32' || !app.isPackaged)
    throw new Error(
      'Windows startup is available in the installed Windows app.',
    );
  // Remove only this selected profile's recognized legacy launcher, after explicit opt-in.
  if (startupEnabled(preferences.profile))
    setStartup(preferences.profile, false);
  app.setLoginItemSettings({
    ...loginOptions,
    // Use Electron's default AppUserModelID key so reads and writes agree.
    openAtLogin: enabled,
    enabled,
  });
};
let quitTask: Promise<void> | undefined;
function quit(): Promise<void> {
  return (quitTask ??= (async () => {
    if (stopped) return;
    quitting = true;
    await runtime?.stop();
    stopped = true;
    tray?.destroy();
    app.quit();
  })());
}

function show() {
  if (window?.isMinimized()) window.restore();
  window?.show();
  window?.focus();
}
async function serverListening(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ host, port });
    const finish = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(700, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}
async function launchOpenRGB() {
  if (!runtime || launchingRGB) return;
  const config = (await runtime.api('status')).config;
  if (config.adapter !== 'openrgb')
    throw new Error('Choose real hardware first.');
  if (await serverListening(config.openrgb.host, config.openrgb.port))
    return {
      started: false,
      message:
        'An SDK listener is already running. Connect to check its devices.',
    };
  if (
    process.platform !== 'win32' ||
    basename(preferences.openRGBPath).toLowerCase() !== 'openrgb.exe' ||
    !existsSync(preferences.openRGBPath)
  )
    throw new Error('Choose your installed OpenRGB.exe in Settings first.');
  launchingRGB = true;
  try {
    const child = spawn(
      preferences.openRGBPath,
      openRGBArguments(config.openrgb.host, config.openrgb.port),
      {
        shell: false,
        detached: true,
        windowsHide: true,
        stdio: 'ignore',
      },
    );
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    child.unref();
    return {
      started: true,
      message:
        'OpenRGB launched. Allow hardware detection to finish, then Connect. RAM may require OpenRGB administrator access.',
    };
  } finally {
    launchingRGB = false;
  }
}
function validateSender(event: IpcMainInvokeEvent) {
  if (
    !runtime ||
    event.sender !== window?.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    !trustedDesktopFrame(event.senderFrame.url, runtime.origin)
  )
    throw new Error('Untrusted desktop request');
}
function handle(name: string, fn: (value: unknown) => unknown) {
  ipcMain.handle(name, async (event, value) => {
    validateSender(event);
    try {
      return { ok: true, value: await fn(value) };
    } catch (error) {
      // Only explicitly authored validation messages reach the renderer; no OS stacks/private arguments.
      return {
        ok: false,
        error:
          error instanceof z.ZodError
            ? 'Invalid desktop settings.'
            : error instanceof Error &&
                /^(Choose |Select |Windows startup|An SDK|OpenRGB requires)/.test(
                  error.message,
                )
              ? error.message
              : 'Could not complete this action. Check the selected folder, OpenRGB installation and permissions.',
      };
    }
  });
}
async function boot() {
  desktopLogger.log('info', 'desktop_starting_bridge');
  const launch = () =>
    startDesktopService({
      entry: app.isPackaged
        ? join(process.resourcesPath, 'bridge', 'dist', 'desktop', 'bridge.js')
        : fileURLToPath(new URL('./bridge.js', import.meta.url)),
      node: app.isPackaged
        ? join(process.resourcesPath, 'runtime', 'node.exe')
        : process.env.BRIDGE_NODE_PATH ||
          process.env.npm_node_execpath ||
          'node',
      profile: preferences.profile,
      autostart: loginEnabled(),
      setAutostart: setLogin,
      diagnostic: (event) => desktopLogger.log('info', event),
    });
  try {
    runtime = await launch();
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== 'PROFILE_ALREADY_RUNNING'
    )
      throw error;
    const answer = await dialog.showMessageBox({
      type: 'question',
      title: 'Your bridge is already running',
      message: 'Switch this profile to the desktop app?',
      detail:
        'The old bridge will stop gracefully. Pairing and selected lights stay in the same profile.',
      buttons: ['Stop old bridge and continue', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    });
    if (answer.response !== 0) {
      app.quit();
      return;
    }
    const session = z
      .strictObject({
        origin: z.string().regex(/^http:\/\/127\.0\.0\.1:\d+$/),
        token: z.string().regex(/^[a-f0-9]{64}$/),
        pid: z.number().optional(),
      })
      .parse(readJSON(join(preferences.profile, 'admin-session.json')));
    const response = await fetch(session.origin + '/api/quit', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + session.token,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error('Old bridge refused shutdown', { cause: error });
    for (
      let i = 0;
      i < 100 && existsSync(join(preferences.profile, 'admin-session.json'));
      i++
    )
      await new Promise((r) => setTimeout(r, 100));
    runtime = await launch();
  }
  if (!runtime) throw new Error('Desktop backend unavailable');
  desktopLogger.log('info', 'desktop_bridge_ready');
  const origin = runtime.origin;
  const partition = 'bridge-' + Date.now(); // In-memory: credentials and session storage never persist in Chromium profiles.
  window = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 780,
    minHeight: 580,
    title: 'HomeKit RGB Bridge',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#202020' : '#f3f3f3',
    show: false,
    autoHideMenuBar: true,
    icon: fileURLToPath(
      new URL('../../desktop-assets/icon.png', import.meta.url),
    ),
    webPreferences: {
      preload: fileURLToPath(
        new URL('../../desktop-assets/preload.cjs', import.meta.url),
      ),
      partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  desktopLogger.log('info', 'desktop_window_created');
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!trustedDesktopFrame(url, origin)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) =>
    event.preventDefault(),
  );
  window.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      window?.hide();
    }
  });
  window.on('query-session-end', () => {
    void runtime?.stop();
  });
  Menu.setApplicationMenu(null);
  const icon = nativeImage
    .createFromPath(
      fileURLToPath(new URL('../../desktop-assets/icon.png', import.meta.url)),
    )
    .resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.setToolTip('HomeKit RGB Bridge');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open HomeKit RGB Bridge', click: show },
      { type: 'separator' },
      {
        label: 'Start bridge',
        click: () => {
          void runtime?.api('start', {}).catch(show);
        },
      },
      {
        label: 'Stop bridge',
        click: () => {
          void runtime?.api('stop', {}).catch(show);
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          void quit();
        },
      },
    ]),
  );
  tray.on('double-click', show);
  tray.on('click', show);
  handle('desktop:info', () => ({
    platform: process.platform,
    packaged: app.isPackaged,
    profile: preferences.profile,
    profiles: profileCandidates(dataDirectory()),
    openRGBPath: preferences.openRGBPath,
    launchOpenRGB: preferences.launchOpenRGB,
    setupComplete: preferences.setupComplete,
    autostart: loginEnabled(),
    legacyStartup: startupEnabled(preferences.profile),
  }));
  handle('desktop:preferences', (value) => {
    const p = z
      .strictObject({ launchOpenRGB: z.boolean(), setupComplete: z.boolean() })
      .parse(value);
    if (p.launchOpenRGB && !existsSync(preferences.openRGBPath))
      throw new Error('Choose your installed OpenRGB.exe first.');
    Object.assign(preferences, p);
    saveDesktopSettings(desktopDir, preferences);
    return true;
  });
  handle('desktop:profile', async () => {
    const selected = await dialog.showOpenDialog(window!, {
      title: 'Select your existing bridge profile (contains config.json)',
      properties: ['openDirectory'],
    });
    if (selected.canceled || !selected.filePaths[0]) return false;
    const profile = resolve(selected.filePaths[0]);
    if (!existsSync(join(profile, 'config.json')))
      throw new Error('Select a bridge profile folder containing config.json.');
    loadConfig(profile); // Read/validate only; never rewrite the selected installation.
    preferences.profile = profile;
    saveDesktopSettings(desktopDir, preferences);
    app.relaunch();
    await quit();
    return true;
  });
  handle('desktop:openrgb-file', async () => {
    const selected = await dialog.showOpenDialog(window!, {
      title: 'Choose your installed OpenRGB.exe',
      properties: ['openFile'],
      filters: [{ name: 'OpenRGB executable', extensions: ['exe'] }],
    });
    if (selected.canceled || !selected.filePaths[0]) return false;
    if (basename(selected.filePaths[0]).toLowerCase() !== 'openrgb.exe')
      throw new Error('Choose OpenRGB.exe.');
    preferences.openRGBPath = selected.filePaths[0];
    saveDesktopSettings(desktopDir, preferences);
    return true;
  });
  handle('desktop:openrgb-start', () => launchOpenRGB());
  const help: Record<string, string> = {
    openrgb: 'https://openrgb.org/',
    pawnio: 'https://pawnio.eu/',
    pairing:
      'https://github.com/daqua22/homekit-rgb-bridge/blob/codex/desktop-v2/docs/apple-home-pairing.md',
    issues: 'https://github.com/daqua22/homekit-rgb-bridge/issues',
  };
  handle('desktop:help', async (value) => {
    const key = z.enum(['openrgb', 'pawnio', 'pairing', 'issues']).parse(value);
    await shell.openExternal(help[key]!);
  });
  powerMonitor.on('resume', () => {
    if (preferences.launchOpenRGB)
      void launchOpenRGB().catch(() =>
        console.error('OpenRGB launch unavailable; check its settings.'),
      );
  });
  if (preferences.launchOpenRGB)
    void launchOpenRGB().catch(() =>
      console.error('OpenRGB launch unavailable; check its settings.'),
    );
  runtime.child.once('exit', () => {
    if (!quitting) void quit();
  });
  await window.loadURL(origin + '/desktop#token=' + runtime.token);
  desktopLogger.log('info', 'desktop_window_loaded');
  if (!process.argv.includes('--hidden') || !preferences.setupComplete) show();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    desktopLogger.log('info', 'desktop_second_instance');
    show();
  });
  app.on('activate', show);
  app.on('window-all-closed', () => {
    /* Tray owns background lifecycle. */
  });
  app.on('before-quit', (event) => {
    if (!stopped) {
      event.preventDefault();
      void quit().catch(() => {
        stopped = true;
        app.quit();
      });
    }
  });
  void app
    .whenReady()
    .then(boot)
    .catch(async () => {
      desktopLogger.log('error', 'desktop_startup_failed');
      await dialog.showMessageBox({
        type: 'error',
        title: 'Bridge could not start',
        message: 'Check the selected profile, local ports and permissions.',
        detail:
          'Your pairing files were not reset. Stop an older bridge using this profile, then reopen. See the troubleshooting guide.',
      });
      await quit();
    });
}
