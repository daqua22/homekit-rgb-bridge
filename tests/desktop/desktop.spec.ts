import {
  _electron as electron,
  test,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import {
  mkdtempSync,
  realpathSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { defaultConfig } from '../../src/config/config-manager.js';
import { loadIdentity } from '../../src/config/identity.js';
import { controller, sdkServer } from '../openrgb-fixture.js';
let app: ElectronApplication, page: Page, root: string, profile: string;
let launchArgs: string[];
let sdk: Awaited<ReturnType<typeof sdkServer>>, originalIdentity: string;
async function freePort() {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const a = s.address();
  if (!a || typeof a === 'string') throw Error('No test port');
  const port = a.port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}
test.beforeAll(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'rgb-desktop-')));
  profile = join(root, 'Existing hardware profile');
  mkdirSync(profile);
  sdk = await sdkServer();
  sdk.state.version = 6;
  sdk.state.controllers = [
    controller('Synthetic RAM', 'fixture-ram'),
    controller('Synthetic Fans', 'fixture-fans', true, [
      { name: 'Fan 1', count: 2 },
      { name: 'Fan 2', count: 2 },
    ]),
  ];
  const config = defaultConfig(false);
  config.openrgb.port = sdk.port;
  config.homekit.port = await freePort();
  config.homekit.bind = ['127.0.0.1'];
  config.admin.port = await freePort();
  const legacy: Record<string, unknown> = { ...config };
  delete legacy.version;
  delete legacy.groups;
  delete legacy.experimentalZones;
  writeFileSync(join(profile, 'config.json'), JSON.stringify(legacy));
  loadIdentity(profile);
  originalIdentity = readFileSync(join(profile, 'identity.json'), 'utf8');
  const originalConfig = readFileSync(join(profile, 'config.json'), 'utf8');
  const args = [
    '--desktop-data-dir',
    join(root, 'desktop-data'),
    '--data-dir',
    profile,
  ];
  launchArgs = process.env.BRIDGE_DESKTOP_EXE ? args : ['.', ...args];
  app = await electron.launch({
    ...(process.env.BRIDGE_DESKTOP_EXE
      ? { executablePath: process.env.BRIDGE_DESKTOP_EXE }
      : {}),
    args: launchArgs,
    cwd: resolve('.'),
    timeout: 40000,
  });
  try {
    page = await app.firstWindow();
  } catch (error) {
    const log = join(root, 'desktop-data', 'events.log');
    if (existsSync(log))
      console.error(
        'Fixed desktop startup events:\n' + readFileSync(log, 'utf8'),
      );
    console.error(
      'Native window count:',
      await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
      ),
    );
    throw error;
  }
  await expect(
    page.getByRole('heading', { name: 'Overview', exact: true }),
  ).toBeVisible();
  expect(readFileSync(join(profile, 'config.json'), 'utf8')).toBe(
    originalConfig,
  );
});
test.afterAll(async () => {
  if (app) {
    try {
      if (
        page &&
        process.platform === 'win32' &&
        process.env.BRIDGE_DESKTOP_EXE
      ) {
        await page.evaluate(async () => {
          const value = sessionStorage.getItem('bridge-token');
          await fetch('/api/autostart', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + value,
              'Content-Type': 'application/json',
            },
            body: '{"enabled":false}',
          });
        });
      }
    } catch {
      /* Already quit. */
    } finally {
      try {
        await app.close();
      } catch {
        /* Already quit. */
      }
    }
  }
  await sdk?.close();
  if (root)
    rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 200,
    });
});
test('settings clicks are retained while initial device discovery is pending', async () => {
  let release!: () => void, seen!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  const started = new Promise<void>((r) => {
    seen = r;
  });
  let first = true;
  await page.route('**/api/devices', async (route) => {
    if (first) {
      first = false;
      seen();
      await held;
    }
    await route.continue();
  });
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await started;
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page
      .getByText('Diagnostics & advanced options', { exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Refresh diagnostics', exact: true })
      .click();
    release();
    await expect(page.locator('#desktop-logs')).toContainText(
      'control_panel_ready',
    );
  } finally {
    release();
    await page.unroute('**/api/devices');
  }
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
});
test('installed-style setup → real SDK protocol → selected light → HomeKit → persisted identity', async () => {
  await expect(page.locator('#demo-banner')).toBeHidden();
  await expect(page.locator('#light-count')).toHaveText('0');
  await expect(page.locator('#start-bridge')).toBeDisabled();
  await page.getByRole('button', { name: 'RGB devices' }).click();
  await expect(page.locator('#device-list')).toContainText('Synthetic RAM');
  await page
    .locator('#device-list')
    .getByRole('checkbox', { name: 'Synthetic RAM', exact: true })
    .check();
  await page.getByLabel('Name in Apple Home', { exact: true }).fill('Desk RAM');
  await page
    .getByLabel('Apply my light selections and create a private backup')
    .check();
  await page
    .getByRole('button', { name: 'Save lights & start bridge' })
    .click();
  await expect(page.locator('#bridge-status')).toContainText('Bridge running');
  await expect(page.locator('#light-count')).toHaveText('1');
  await expect(page.locator('#lights-grid')).toContainText('Desk RAM');
  expect(readFileSync(join(profile, 'identity.json'), 'utf8')).toBe(
    originalIdentity,
  );
  expect(existsSync(join(profile, 'backups'))).toBe(true);
  await page
    .getByRole('button', { name: 'Desk RAM: Blue', exact: true })
    .click();
  await expect
    .poll(() =>
      sdk.writes.some(
        (w) =>
          w.id === 1050 &&
          w.body.subarray(6, 10).equals(Buffer.from([0, 85, 255, 0])),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Stop bridge', exact: true }).click();
  await expect(page.locator('#bridge-status')).toContainText('stopped');
  await page.getByRole('button', { name: 'Start bridge', exact: true }).click();
  await expect(page.locator('#bridge-status')).toContainText('running');
  expect(readFileSync(join(profile, 'identity.json'), 'utf8')).toBe(
    originalIdentity,
  );
  await page.getByRole('button', { name: 'Apple Home', exact: true }).click();
  await expect(page.locator('#private-pairing')).toBeHidden();
  await page
    .getByRole('button', { name: 'Reveal private pairing code', exact: true })
    .click();
  await expect(page.locator('#desktop-qr')).toHaveAttribute(
    'src',
    /^data:image\/png;base64,/,
  );
  await page
    .getByRole('button', { name: 'Hide pairing code', exact: true })
    .click();
  await expect(page.locator('#desktop-pin')).toBeEmpty();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  mkdirSync('artifacts', { recursive: true });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'artifacts/desktop-setup.png' });
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    'BODY',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('desktop renderer is sandboxed and cannot navigate to external code', async () => {
  const security = await page.evaluate(
    () =>
      (
        window as unknown as {
          desktop: {
            security: { sandboxed: boolean; contextIsolated: boolean };
          };
        }
      ).desktop.security,
  );
  expect(security).toEqual({ sandboxed: true, contextIsolated: true });
  expect(
    await page.evaluate(() => ({
      require: typeof (window as unknown as { require?: unknown }).require,
      process: typeof (window as unknown as { process?: unknown }).process,
    })),
  ).toEqual({ require: 'undefined', process: 'undefined' });
  await page.evaluate(() => {
    window.open('https://example.com');
  });
  expect(
    await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    ),
  ).toBe(1);
  await page.evaluate(() => {
    location.href = 'https://example.com';
  });
  await expect.poll(() => new URL(page.url()).pathname).toBe('/desktop');
  expect(new URL(page.url()).hash).toBe('');
  await page.goto(new URL(page.url()).origin + '/desktop', {
    waitUntil: 'domcontentloaded',
  });
  await expect(
    page.getByRole('heading', { name: 'Overview', exact: true }),
  ).toBeVisible();
});
test('Windows login preference, setup completion and tray lifecycle', async () => {
  if (process.platform === 'win32' && process.env.BRIDGE_DESKTOP_EXE)
    await page.locator('#setup-startup').uncheck();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  if (process.platform === 'win32' && process.env.BRIDGE_DESKTOP_EXE) {
    await page.getByLabel('Launch at Windows sign-in', { exact: true }).check();
    await expect
      .poll(() =>
        app.evaluate(
          ({ app }) =>
            app.getLoginItemSettings({
              path: process.execPath,
              args: ['--hidden'],
            }).openAtLogin,
        ),
      )
      .toBe(true);
    await page
      .getByLabel('Launch at Windows sign-in', { exact: true })
      .uncheck();
    await expect
      .poll(() =>
        app.evaluate(
          ({ app }) =>
            app.getLoginItemSettings({
              path: process.execPath,
              args: ['--hidden'],
            }).openAtLogin,
        ),
      )
      .toBe(false);
  } else
    await expect(
      page.getByLabel('Launch at Windows sign-in', { exact: true }),
    ).toBeDisabled();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  if (process.platform === 'win32' && process.env.BRIDGE_DESKTOP_EXE)
    await expect(page.locator('#setup-startup')).not.toBeChecked();
  await page.getByRole('button', { name: 'Finish setup', exact: true }).click();
  await expect(page.locator('#setup-card')).toBeHidden();
  await page.mouse.move(0, 0);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: 'artifacts/desktop-overview.png' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.screenshot({ path: 'artifacts/desktop-settings.png' });
  // Check the minimum supported window size through each usable view.
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(780, 580),
  );
  for (const view of ['Overview', 'RGB devices', 'Apple Home', 'Settings']) {
    await page
      .getByRole('button', { name: view, exact: view !== 'RGB devices' })
      .click();
    await expect(
      page.getByRole('heading', { name: view, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({ path: 'artifacts/desktop-settings-compact.png' });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(1040, 760),
  );
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'artifacts/desktop-overview-dark.png' });
  await page.emulateMedia({ colorScheme: 'light' });
  const preferences = JSON.parse(
    readFileSync(join(root, 'desktop-data', 'desktop-settings.json'), 'utf8'),
  );
  expect(preferences.setupComplete).toBe(true);
  expect(preferences.profile).toBe(profile);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.close(),
  );
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.isVisible(),
    ),
  ).toBe(false);
  expect(
    await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    ),
  ).toBe(1);
  expect(existsSync(join(profile, 'admin-session.json'))).toBe(true);
  const executable = await app.evaluate(() => process.execPath);
  const launchEnv = { ...process.env };
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  delete launchEnv.NODE_OPTIONS;
  const second = spawn(executable, launchArgs, {
    cwd: resolve('.'),
    stdio: 'ignore',
    env: launchEnv,
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      second.kill();
      reject(new Error('Second desktop instance did not exit'));
    }, 10000);
    second.once('error', reject);
    second.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  expect(code).toBe(0);
  try {
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]!.isVisible(),
        ),
      )
      .toBe(true);
  } catch (error) {
    console.error(
      'Fixed desktop lifecycle events:\n' +
        readFileSync(join(root, 'desktop-data', 'events.log'), 'utf8'),
    );
    throw error;
  }
  await app.close();
  expect(existsSync(join(profile, 'admin-session.json'))).toBe(false);
  expect(existsSync(join(profile, 'application.lock'))).toBe(false);
  expect(existsSync(join(profile, 'bridge.lock'))).toBe(false);
  expect(readFileSync(join(profile, 'identity.json'), 'utf8')).toBe(
    originalIdentity,
  );
});
