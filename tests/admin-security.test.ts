import { afterEach, it, expect } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { initialize } from '../src/config/config-manager.js';
import { AppController } from '../src/app/controller.js';
import { startAdmin } from '../src/app/server.js';
const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'rgb-admin-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  initialize(dir, true);
  const controller = new AppController(dir);
  const admin = await startAdmin(controller, { port: 0 });
  cleanup.push(admin.close);
  return { controller, admin, dir };
}
it('protects all configuration and pairing routes and rejects cross-origin requests', async () => {
  const { admin } = await setup();
  for (const path of ['/api/status', '/api/logs'])
    expect((await fetch(admin.origin + path)).status).toBe(401);
  const headers = { Authorization: 'Bearer ' + admin.token };
  expect((await fetch(admin.origin + '/api/status', { headers })).status).toBe(
    200,
  );
  expect(
    (
      await fetch(admin.origin + '/api/status', {
        headers: { ...headers, Origin: 'https://attacker.example' },
      })
    ).status,
  ).toBe(403);
  const result = await fetch(admin.origin + '/api/stop', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'text/plain' },
    body: '{}',
  });
  expect(result.status).toBe(400);
});
it('serves only explicit assets with restrictive security headers', async () => {
  const { admin } = await setup();
  const response = await fetch(admin.origin);
  expect(response.headers.get('Content-Security-Policy')).toContain(
    "frame-ancestors 'none'",
  );
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect((await fetch(admin.origin + '/../package.json')).status).toBe(401);
});
it('allows the launcher document navigation while retaining origin, host and API protection', async () => {
  const { admin } = await setup();
  const navigation = {
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Dest': 'document',
  };
  async function raw(
    path: string,
    method = 'GET',
    extra: Record<string, string> = {},
  ) {
    return new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        admin.origin + path,
        { method, headers: { ...navigation, ...extra } },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode));
        },
      );
      req.on('error', reject);
      req.end();
    });
  }
  expect(await raw('/')).toBe(200);
  for (const path of ['/api/status', '/api/logs', '/app.js', '/style.css'])
    expect(await raw(path)).toBe(403);
  expect(await raw('/', 'POST')).toBe(403);
  expect(await raw('/', 'GET', { 'Sec-Fetch-Mode': 'cors' })).toBe(403);
  expect(await raw('/', 'GET', { 'Sec-Fetch-Dest': 'iframe' })).toBe(403);
  expect(await raw('/', 'GET', { Host: 'attacker.example' })).toBe(403);
  for (const Origin of ['null', 'https://attacker.example']) {
    expect(await raw('/', 'GET', { Origin })).toBe(403);
    expect(
      await raw('/api/status', 'GET', {
        Origin,
        Authorization: 'Bearer ' + admin.token,
      }),
    ).toBe(403);
  }
  expect(
    await raw('/api/stop', 'POST', {
      Origin: admin.origin,
      Authorization: 'Bearer ' + admin.token,
    }),
  ).toBe(403);
});
it('requires a matching revision and explicit save consent, creates a backup and rejects unsupported config versions', async () => {
  const { controller, dir } = await setup();
  const before = readFileSync(join(dir, 'config.json'), 'utf8'),
    revision = controller.revision();
  await expect(
    controller.save(controller.config, revision, false),
  ).rejects.toThrow();
  await expect(
    controller.save(controller.config, 'stale', true),
  ).rejects.toThrow();
  expect(readFileSync(join(dir, 'config.json'), 'utf8')).toBe(before);
  await controller.save(
    {
      ...controller.config,
      homekit: { ...controller.config.homekit, port: 51827 },
    },
    revision,
    true,
  );
  expect(controller.status().backups).toBe(1);
  expect(controller.config.homekit.port).toBe(51827);
});
it('never includes pairing credentials in dashboard, requires explicit reveal and reset confirmation', async () => {
  const { controller, admin } = await setup();
  expect(
    await (
      await fetch(admin.origin + '/api/status', {
        headers: { Authorization: 'Bearer ' + admin.token },
      })
    ).text(),
  ).not.toMatch(/pincode|setupID|X-HM/);
  await expect(controller.pairing()).rejects.toThrow();
  await expect(controller.reset('yes')).rejects.toThrow();
});
it('rejects malformed/oversized admin bodies and denies preflight without CORS permission', async () => {
  const { admin } = await setup(),
    headers = {
      Authorization: 'Bearer ' + admin.token,
      'Content-Type': 'application/json',
    };
  expect(
    (
      await fetch(admin.origin + '/api/start', {
        method: 'POST',
        headers,
        body: '{broken',
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await fetch(admin.origin + '/api/start', {
        method: 'POST',
        headers,
        body: 'x'.repeat(70000),
      })
    ).status,
  ).toBe(400);
  const options = await fetch(admin.origin + '/api/config', {
    method: 'OPTIONS',
    headers: { Origin: 'https://attacker.example' },
  });
  expect(options.status).toBe(403);
  expect(options.headers.get('Access-Control-Allow-Origin')).toBe(null);
});
it('rejects a rebound Host header even with a valid local bearer', async () => {
  const { admin } = await setup();
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const req = request(
      admin.origin + '/api/status',
      {
        headers: {
          Host: 'attacker.example',
          Authorization: 'Bearer ' + admin.token,
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    req.end();
  });
  expect(status).toBe(403);
});

it('backs up before deliberate reset and retains config/state while requiring a new process', async () => {
  const { controller, dir } = await setup();
  const { loadIdentity } = await import('../src/config/identity.js');
  loadIdentity(dir);
  mkdirSync(join(dir, 'hap-storage'));
  writeFileSync(
    join(dir, 'hap-storage', 'old-pairing'),
    'private synthetic pairing',
  );
  writeFileSync(
    join(dir, 'state.json'),
    '{"mock:virtual-light":{"on":true,"hue":0,"saturation":0,"brightness":50}}',
  );
  const originalConfig = readFileSync(join(dir, 'config.json'), 'utf8'),
    originalState = readFileSync(join(dir, 'state.json'), 'utf8');
  await controller.reset('RESET HOMEKIT PAIRING');
  expect(existsSync(join(dir, 'identity.json'))).toBe(false);
  expect(existsSync(join(dir, 'hap-storage'))).toBe(false);
  expect(readFileSync(join(dir, 'config.json'), 'utf8')).toBe(originalConfig);
  expect(readFileSync(join(dir, 'state.json'), 'utf8')).toBe(originalState);
  const backup = readdirSync(join(dir, 'backups'))[0]!;
  expect(existsSync(join(dir, 'backups', backup, 'identity.json'))).toBe(true);
  expect(controller.status().restartRequired).toBe(true);
  await expect(controller.start()).rejects.toThrow('reopen');
});
