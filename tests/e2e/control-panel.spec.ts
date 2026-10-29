import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
let child: ChildProcess,
  dir: string,
  session: { origin: string; token: string };
async function freePort() {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const a = s.address();
  if (!a || typeof a === 'string') throw Error('Port unavailable');
  const p = a.port;
  await new Promise<void>((r) => s.close(() => r()));
  return p;
}
async function api(path: string, body?: unknown) {
  const r = await fetch(session.origin + '/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: 'Bearer ' + session.token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw Error('API failed: ' + path);
  return r.json();
}
test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'rgb-browser-'));
  const { defaultConfig } = await import('../../src/config/config-manager.js');
  const config = defaultConfig(true);
  config.homekit.port = await freePort();
  config.homekit.bind = ['127.0.0.1'];
  config.admin.port = await freePort();
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config));
  child = spawn(
    process.execPath,
    [resolve('dist/index.js'), 'app', '--data-dir', dir],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 400; i++) {
    if (existsSync(join(dir, 'admin-session.json'))) {
      session = JSON.parse(
        readFileSync(join(dir, 'admin-session.json'), 'utf8'),
      );
      try {
        if ((await api('status')).running) return;
      } catch {
        /* Starting. */
      }
    }
    await delay(50);
  }
  throw Error('Application did not start');
});
test.afterAll(async () => {
  if (session)
    try {
      await api('quit', {});
    } catch {
      /* Already stopped. */
    }
  if (child?.exitCode === null)
    await Promise.race([
      new Promise((r) => child.once('exit', r)),
      delay(5000),
    ]);
  if (child?.exitCode === null) child.kill('SIGKILL');
  if (dir) rmSync(dir, { recursive: true, force: true });
});
test('browser → authenticated API → persisted config/state → mock adapter → UI', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(session.origin + '/#token=' + session.token);
  await expect(
    page.getByRole('heading', { name: 'HomeKit RGB Bridge', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#dashboard')).toContainText('Running');
  await expect(page.locator('#pairing')).toBeHidden();
  await page
    .getByRole('button', { name: 'Discover devices', exact: true })
    .click();
  await expect(page.locator('#devices')).toContainText('Virtual RGB Light');
  const name = page.locator('#devices').getByLabel('HomeKit name');
  await name.fill('Desk RGB');
  await page
    .getByLabel('I confirm these configuration changes.', { exact: false })
    .check();
  const identity = readFileSync(join(dir, 'identity.json'), 'utf8');
  await page
    .getByRole('button', { name: 'Back up & save configuration' })
    .click();
  await expect(page.locator('#message')).toContainText('backed up and saved');
  expect(readFileSync(join(dir, 'identity.json'), 'utf8')).toBe(identity);
  expect(
    JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')).devices[0].name,
  ).toBe('Desk RGB');
  const light = page.locator('#lights .light');
  await expect(light).toContainText('Desk RGB');
  await light.getByLabel('On', { exact: true }).check();
  await light.getByLabel('Hue', { exact: true }).fill('240');
  await light.getByLabel('Saturation', { exact: true }).fill('100');
  await light.getByLabel('Brightness', { exact: true }).fill('50');
  await expect
    .poll(async () => {
      const s = await api('status');
      return s.lights[0].state;
    })
    .toEqual({ on: true, hue: 240, saturation: 100, brightness: 50 });
  await page
    .getByRole('button', { name: 'Reveal private pairing code & QR' })
    .click();
  await expect(page.locator('#qr')).toHaveAttribute(
    'src',
    /^data:image\/png;base64,/,
  );
  await page.getByRole('button', { name: 'Hide pairing information' }).click();
  await expect(page.locator('#pairing')).toBeHidden();
  await expect(page.locator('#pin')).toBeEmpty();
  await page.getByRole('button', { name: 'Stop bridge', exact: true }).click();
  await expect(page.locator('#dashboard')).toContainText('Stopped');
  await page.getByRole('button', { name: 'Start bridge', exact: true }).click();
  await expect(page.locator('#dashboard')).toContainText('Running');
  expect(readFileSync(join(dir, 'identity.json'), 'utf8')).toBe(identity);
  await page
    .getByRole('button', { name: 'Refresh diagnostics', exact: true })
    .click();
  await expect(page.locator('#logs')).toContainText('adapter_connected');
  expect(errors).toEqual([]);
  mkdirSync('artifacts', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'artifacts/control-panel-overview.png',
    fullPage: false,
  });
  await page.screenshot({
    path: 'artifacts/control-panel-mock.png',
    fullPage: true,
    mask: [page.locator('#data-path')],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    'BODY',
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page
    .locator('#devices')
    .getByLabel('Virtual RGB Light', { exact: true })
    .uncheck();
  await page.getByRole('button', { name: 'Add group', exact: true }).click();
  await page
    .locator('#groups')
    .getByLabel('Group name', { exact: true })
    .fill('Desk Group');
  await page
    .locator('#groups')
    .getByLabel('Enable group', { exact: true })
    .check();
  await page
    .locator('#groups')
    .getByLabel('Virtual RGB Light', { exact: true })
    .check();
  await page
    .getByLabel('I confirm these configuration changes.', { exact: false })
    .check();
  await page
    .getByRole('button', { name: 'Back up & save configuration' })
    .click();
  await expect
    .poll(async () => {
      const s = await api('status');
      return s.lights[0]?.name;
    })
    .toBe('Desk Group');
  expect(readFileSync(join(dir, 'identity.json'), 'utf8')).toBe(identity);
});
test('rejects untrusted requests and keeps pairing private in default dashboard', async ({
  request,
}) => {
  expect((await request.get(session.origin + '/api/status')).status()).toBe(
    401,
  );
  expect(
    (
      await request.post(session.origin + '/api/stop', {
        headers: {
          Authorization: 'Bearer ' + session.token,
          Origin: 'https://untrusted.example',
        },
        data: {},
      })
    ).status(),
  ).toBe(403);
  const status = JSON.stringify(await api('status'));
  expect(status).not.toContain('pincode');
  expect(status).not.toContain('setupID');
});
