import { afterEach, describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireLock,
  configSchema,
  defaultConfig,
  initialize,
  loadConfig,
} from '../src/config/config-manager.js';
import { StateStore } from '../src/config/state-store.js';
import { loadIdentity } from '../src/config/identity.js';
const dirs: string[] = [];
function temp() {
  const p = mkdtempSync(join(tmpdir(), 'rgb-test-'));
  dirs.push(p);
  return p;
}
afterEach(() => {
  for (const p of dirs.splice(0)) rmSync(p, { recursive: true, force: true });
});
describe('configuration and local persistence', () => {
  it('initializes once, persists and validates', () => {
    const dir = temp();
    initialize(dir, true);
    expect(loadConfig(dir)).toEqual(defaultConfig(true));
    expect(() => initialize(dir, false)).toThrow();
  });
  it('rejects unknown fields, remote hosts, bad ports and duplicate IDs', () => {
    const c = defaultConfig(true);
    for (const bad of [
      { ...c, secret: 'x' },
      { ...c, openrgb: { ...c.openrgb, host: 'example.com' } },
      { ...c, openrgb: { ...c.openrgb, port: 0 } },
      { ...c, devices: [c.devices[0], c.devices[0]] },
      { ...c, devices: [{ ...c.devices[0], id: 'wrong' }] },
      { ...c, connection: { ...c.connection, maxRetryMs: 100 } },
    ])
      expect(configSchema.safeParse(bad).success).toBe(false);
  });
  it('restores desired light state across restarts', () => {
    const dir = temp();
    const state = { on: true, hue: 120, saturation: 50, brightness: 70 };
    new StateStore(dir).set('mock:a', state);
    expect(new StateStore(dir).get('mock:a')).toEqual(state);
  });
  it('rejects corrupted state instead of silently resetting it', () => {
    const dir = temp();
    expect(() =>
      new StateStore(dir).set('x', {
        on: true,
        hue: NaN,
        saturation: 0,
        brightness: 100,
      }),
    ).toThrow();
  });
  it('keeps per-install credentials stable and distinct', () => {
    const dir = temp(),
      a = loadIdentity(dir),
      b = loadIdentity(temp());
    expect(loadIdentity(dir)).toEqual(a);
    expect(b.username).not.toBe(a.username);
    expect(a.pincode).toMatch(/^\d{3}-\d{2}-\d{3}$/);
    expect(a.setupID).toHaveLength(4);
    if (process.platform !== 'win32')
      expect(statSync(join(dir, 'identity.json')).mode & 0o777).toBe(0o600);
  });
  it('allows only one process for the data directory', () => {
    const dir = temp(),
      unlock = acquireLock(dir);
    expect(() => acquireLock(dir)).toThrow();
    expect(readFileSync(join(dir, 'bridge.lock'), 'utf8')).toBe(
      String(process.pid),
    );
    unlock();
    acquireLock(dir)();
  });
});
