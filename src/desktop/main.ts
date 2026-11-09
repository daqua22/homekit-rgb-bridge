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
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve, basename, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { dataDirectory, readJSON } from '../config/config-manager.js';
import { startDesktopService } from './service.js';
import { Logger } from '../utils/logger.js';
import { setStartup, startupEnabled } from '../windows/startup.js';
import {
  desktopSettingsSchema,
  loadDesktopSettings,
  saveDesktopSettings,
  profileCandidates,
  inspectProfile,
  findOpenRGB,
  trustedDesktopFrame,
} from './settings.js';
import {
  OpenRGBStartup,
  pawnIODriverStatus,
  sdkListening,
  validOpenRGBExecutable,
  type DriverStatus,
} from './prerequisites.js';
import {
  configureManagedTask,
  managedTaskStatus,
  type TaskStatus,
} from './startup-task.js';

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
const profileSearchRoot = resolve(argument('--data-dir') ?? dataDirectory());
const removingStartup = process.argv.includes('--remove-managed-startup');
const startupMarker = join(desktopDir, 'openrgb-startup-task');
const preferences = removingStartup
  ? desktopSettingsSchema.parse({ version: 1, profile: profileSearchRoot })
  : loadDesktopSettings(desktopDir, profileSearchRoot);
if (!preferences.openRGBPath && process.platform === 'win32')
  preferences.openRGBPath = findOpenRGB();
let runtime: Awaited<ReturnType<typeof startDesktopService>>;
let window: BrowserWindow | undefined;
let tray: Tray | undefined;
let quitting = false;
let stopped = false;
const openRGBStartup = new OpenRGBStartup();
let pawnio: DriverStatus =
  process.platform === 'win32' ? 'unknown' : 'not-windows';
let sdkAvailable: boolean | undefined;
let startupError = '';
let taskStatus: TaskStatus = 'missing';
let configuringStartup = false;
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
    openRGBStartup.cancel();
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
function startupStatus() {
  return {
    ...openRGBStartup.snapshot(),
    ...(startupError
      ? { phase: 'attention', message: startupError, ready: false }
      : {}),
    pawnio,
    sdkAvailable,
    taskStatus,
    configuringStartup,
    executableFound: validOpenRGBExecutable(preferences.openRGBPath),
  };
}
async function checkPrerequisites() {
  const config = (await runtime.api('status')).config;
  [pawnio, sdkAvailable, taskStatus] = await Promise.all([
    pawnIODriverStatus(),
    sdkListening(config.openrgb.host, config.openrgb.port),
    existsSync(startupMarker) || preferences.openRGBAdministrator
      ? managedTaskStatus({
          path: preferences.openRGBPath,
          host: config.openrgb.host,
          port: config.openrgb.port,
        })
      : Promise.resolve('missing' as const),
  ]);
  return startupStatus();
}
async function launchOpenRGB() {
  if (!runtime || quitting) return startupStatus();
  const config = (await runtime.api('status')).config;
  if (config.adapter !== 'openrgb')
    throw new Error('Choose real hardware first.');
  startupError = '';
  const result = await openRGBStartup.ensure({
    path: preferences.openRGBPath,
    host: config.openrgb.host,
    port: config.openrgb.port,
    administrator: preferences.openRGBAdministrator,
  });
  sdkAvailable = result.ready;
  return result;
}
function beginOpenRGB() {
  void launchOpenRGB().catch(() => {
    startupError =
      'OpenRGB startup is unavailable. Check the lighting source and settings.';
    desktopLogger.log('error', 'desktop_openrgb_start_unavailable');
  });
}
async function configureWindowsStartup(enabled: boolean) {
  if (process.platform !== 'win32' || !app.isPackaged)
    throw Error(
      'Windows startup setup is available in the installed Windows app.',
    );
  if (configuringStartup)
    throw Error('Windows startup setup is already in progress.');
  configuringStartup = true;
  try {
    if (enabled) {
      if (!validOpenRGBExecutable(preferences.openRGBPath))
        throw Error('Choose your installed OpenRGB.exe first.');
      const config = (await runtime.api('status')).config;
      if (config.adapter !== 'openrgb')
        throw Error('Choose real hardware first.');
      const hadMarker = existsSync(startupMarker);
      writeFileSync(startupMarker, 'v1\n', { mode: 0o600 });
      try {
        await configureManagedTask({
          path: preferences.openRGBPath,
          host: config.openrgb.host,
          port: config.openrgb.port,
        });
      } catch (error) {
        const actual = await managedTaskStatus();
        if (!hadMarker && (actual === 'missing' || actual === 'foreign'))
          unlinkSync(startupMarker);
        throw error;
      }
      taskStatus = 'configured';
      setLogin(true);
      const next = {
        ...preferences,
        launchOpenRGB: true,
        openRGBAdministrator: true,
      };
      saveDesktopSettings(desktopDir, next);
      Object.assign(preferences, next);
      beginOpenRGB();
    } else {
      if (existsSync(startupMarker) || preferences.openRGBAdministrator)
        await configureManagedTask();
      taskStatus = 'missing';
      if (existsSync(startupMarker)) unlinkSync(startupMarker);
      setLogin(false);
      const next = { ...preferences, openRGBAdministrator: false };
      saveDesktopSettings(desktopDir, next);
      Object.assign(preferences, next);
    }
    return true;
  } finally {
    configuringStartup = false;
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
                /^(Choose |Select |Windows startup|Windows could|Use the same Windows administrator|Install OpenRGB inside|An unrelated task|An SDK|OpenRGB requires|This profile is no longer detected\.|HomeKit data exists but identity\.json is missing\.|The profile configuration is unreadable or unsupported\.|The HomeKit storage is unreadable\.|The profile is unavailable\.)/.test(
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
    profiles: profileCandidates(profileSearchRoot, [preferences.profile]),
    openRGBPath: preferences.openRGBPath,
    launchOpenRGB: preferences.launchOpenRGB,
    openRGBAdministrator: preferences.openRGBAdministrator,
    setupComplete: preferences.setupComplete,
    autostart: loginEnabled(),
    legacyStartup: startupEnabled(preferences.profile),
  }));
  handle('desktop:preferences', (value) => {
    const p = z
      .strictObject({
        launchOpenRGB: z.boolean().optional(),
        setupComplete: z.boolean().optional(),
      })
      .parse(value);
    const next = { ...preferences, ...p };
    if (p.launchOpenRGB === false && preferences.openRGBAdministrator)
      throw Error(
        'Windows startup is managed by the RAM startup task. Use Disable automatic Windows startup first.',
      );
    if (next.launchOpenRGB && !validOpenRGBExecutable(next.openRGBPath))
      throw new Error('Choose your installed OpenRGB.exe first.');
    if (next.openRGBAdministrator && process.platform !== 'win32')
      throw new Error('Choose administrator launch only on Windows.');
    saveDesktopSettings(desktopDir, next);
    Object.assign(preferences, next);
    return true;
  });
  handle('desktop:profile', async (value) => {
    let profile: string;
    if (value === undefined) {
      const selected = await dialog.showOpenDialog(window!, {
        title: 'Select your existing bridge profile (contains config.json)',
        defaultPath: preferences.profile,
        properties: ['openDirectory'],
      });
      if (selected.canceled || !selected.filePaths[0]) return false;
      profile = resolve(selected.filePaths[0]);
    } else {
      profile = resolve(
        z.string().min(1).max(32767).refine(isAbsolute).parse(value),
      );
      const found = profileCandidates(profileSearchRoot, [
        preferences.profile,
      ]).find((candidate) => candidate.path === profile);
      if (!found)
        throw new Error(
          'This profile is no longer detected. Search again or browse to its folder.',
        );
      if (!found.available) throw new Error(found.problem);
    }
    if (profile === preferences.profile) return false;
    if (!existsSync(join(profile, 'config.json')))
      throw new Error('Select a bridge profile folder containing config.json.');
    const selected = inspectProfile(profile); // Read only; never rewrite the selected installation.
    if (!selected?.available)
      throw new Error(selected?.problem ?? 'The profile is unavailable.');
    const previous = preferences.profile;
    preferences.profile = profile;
    try {
      saveDesktopSettings(desktopDir, preferences);
    } catch (error) {
      preferences.profile = previous;
      throw error;
    }
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
  handle('desktop:configure-startup', (value) =>
    configureWindowsStartup(z.boolean().parse(value)),
  );
  handle('desktop:startup-status', () => startupStatus());
  handle('desktop:prerequisites', () => checkPrerequisites());
  handle('desktop:openrgb-start', (value) => {
    if (z.boolean().optional().parse(value)) return launchOpenRGB();
    beginOpenRGB();
    return {
      message: 'Checking OpenRGB startup. Progress appears in Settings.',
    };
  });
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
    void checkPrerequisites().catch(() => {});
    if (preferences.launchOpenRGB) beginOpenRGB();
  });
  void checkPrerequisites().catch(() => {});
  if (preferences.launchOpenRGB) beginOpenRGB();
  runtime.child.once('exit', () => {
    if (!quitting) void quit();
  });
  await window.loadURL(origin + '/desktop#token=' + runtime.token);
  desktopLogger.log('info', 'desktop_window_loaded');
  if (!process.argv.includes('--hidden') || !preferences.setupComplete) show();
}
if (removingStartup) {
  void app
    .whenReady()
    .then(async () => {
      if (existsSync(startupMarker)) {
        await configureManagedTask();
        unlinkSync(startupMarker);
      }
      app.exit(0);
    })
    .catch(() => app.exit(1));
} else if (!app.requestSingleInstanceLock()) app.quit();
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
