import { afterEach, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
