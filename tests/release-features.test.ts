import { afterEach, it, expect, vi } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  utimesSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  defaultConfig,
  loadConfig,
  saveConfig,
  configSchema,
  acquireLock,
} from '../src/config/config-manager.js';
import { StateStore } from '../src/config/state-store.js';
import { MockRGBAdapter, virtualDevice } from '../src/adapters/mock-adapter.js';
import { OpenRGBAdapter } from '../src/adapters/openrgb-adapter.js';
import {
  DeviceManager,
  GroupCommandError,
} from '../src/devices/device-manager.js';
import { parseController } from '../src/adapters/openrgb-protocol.js';
import { sdkServer, controller } from './openrgb-fixture.js';
import {
  launcherScript,
  setStartup,
  startupFile,
  readLauncher,
} from '../src/windows/startup.js';
const cleanups: (() => void | Promise<void>)[] = [];
function temp() {
  const d = mkdtempSync(join(tmpdir(), 'rgb-release-'));
  cleanups.push(() => rmSync(d, { recursive: true, force: true }));
  return d;
}
afterEach(async () => {
  for (const f of cleanups.splice(0).reverse()) await f();
  vi.useRealTimers();
});
it('backs up an explicit config migration, preserves port, and rejects future versions', () => {
  const dir = temp(),
    config = defaultConfig(true);
  const legacy = { ...config } as Record<string, unknown>;
  delete legacy.version;
  delete legacy.groups;
  delete legacy.admin;
  delete legacy.experimentalZones;
  (legacy.homekit as { port: number }).port = 51827;
  writeFileSync(join(dir, 'config.json'), JSON.stringify(legacy));
  const original = readFileSync(join(dir, 'config.json'), 'utf8');
  const loaded = loadConfig(dir);
  expect(loaded.version).toBe(1);
  expect(readFileSync(join(dir, 'config.json'), 'utf8')).toBe(original);
  saveConfig(dir, loaded);
  const backup = readdirSync(join(dir, 'backups'))[0]!;
  expect(
    readFileSync(join(dir, 'backups', backup, 'config.json'), 'utf8'),
  ).toBe(original);
  expect(loadConfig(dir).homekit.port).toBe(51827);
  expect(configSchema.safeParse({ ...loaded, version: 2 }).success).toBe(false);
});
it('migrates legacy desired states on first write with a backup', () => {
  const dir = temp();
  writeFileSync(
    join(dir, 'state.json'),
    JSON.stringify({
      'mock:virtual-light': {
        on: true,
        hue: 60,
        saturation: 80,
        brightness: 90,
      },
    }),
  );
  const store = new StateStore(dir);
  store.set('mock:virtual-light', {
    ...store.get('mock:virtual-light'),
    brightness: 50,
  });
  expect(
    JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')).version,
  ).toBe(1);
  expect(new StateStore(dir).get('mock:virtual-light').brightness).toBe(50);
  expect(existsSync(join(dir, 'backups'))).toBe(true);
});
it('recovers an abandoned heartbeat lock while refusing a live lock', () => {
  const dir = temp();
  mkdirSync(join(dir, 'application.lock'));
  const old = new Date(Date.now() - 60000);
  utimesSync(join(dir, 'application.lock'), old, old);
  const release = acquireLock(dir);
  expect(() => acquireLock(dir)).toThrow();
  release();
  expect(existsSync(join(dir, 'application.lock'))).toBe(false);
});
it('preserves unknown live legacy PID locks and reclaims a dead one', () => {
  const dir = temp();
  writeFileSync(join(dir, 'bridge.lock'), String(process.pid));
  expect(() => acquireLock(dir)).toThrow();
  writeFileSync(join(dir, 'bridge.lock'), '2147483646');
  acquireLock(dir)();
  expect(existsSync(join(dir, 'bridge.lock'))).toBe(false);
});
it('writes scoped user-startup launchers without admin commands or pairing secrets', () => {
  const dir = temp(),
    appdata = temp();
  setStartup(
    dir,
    true,
    process.execPath,
    join(dir, 'dist', 'index.js'),
    appdata,
    'win32',
  );
  const file = startupFile(dir, appdata),
    script = readLauncher(file);
  expect(script).toContain(' app --data-dir ');
  expect(script).toContain(', 0, False');
  expect(script).not.toMatch(/pairing|runas|powershell/i);
  setStartup(dir, false, process.execPath, 'entry', appdata, 'win32');
  expect(existsSync(file)).toBe(false);
  expect(() => launcherScript('bad"path', 'x', 'x')).toThrow();
});
it('rejects overlapping whole/zone/group targets and requires experimental-zone consent', () => {
  const c = defaultConfig(false),
    id = 'openrgb:' + 'a'.repeat(24),
    zone = id + ':zone:' + 'b'.repeat(16);
  c.devices = [
    { id, name: 'Device', enabled: true },
    { id: zone, name: 'Fan', enabled: true },
  ];
  expect(configSchema.safeParse(c).success).toBe(false);
  c.devices.shift();
  expect(configSchema.safeParse(c).success).toBe(false);
  c.experimentalZones = true;
  expect(configSchema.safeParse(c).success).toBe(true);
  c.groups = [{ id: 'group:a', name: 'Group', enabled: true, members: [zone] }];
  expect(configSchema.safeParse(c).success).toBe(false);
});
it('preserves other zone bytes through concurrent serialized updates, ignores zero LED zones', async () => {
  const sdk = await sdkServer();
  cleanups.push(sdk.close);
  sdk.state.controllers = [
    controller('Hub', 'hub', true, [
      { name: 'Fan', count: 2 },
      { name: 'Cooler', count: 3 },
      { name: 'Empty', count: 0 },
    ]),
  ];
  const a = new OpenRGBAdapter('127.0.0.1', sdk.port, 1000);
  cleanups.push(() => a.disconnect());
  await a.connect();
  const [d] = await a.discoverDevices();
  expect(d!.zones[2]!.controllable).toBe(false);
  await Promise.all([
    a.setColor(d!.zones[0]!.id!, { r: 255, g: 0, b: 0 }),
    a.setColor(d!.zones[1]!.id!, { r: 0, g: 0, b: 255 }),
  ]);
  await vi.waitFor(() =>
    expect(sdk.writes.filter((w) => w.id === 1050)).toHaveLength(2),
  );
  const data = sdk.writes.filter((w) => w.id === 1050)[1]!.body.subarray(6);
  expect([...data]).toEqual([
    255, 0, 0, 0, 255, 0, 0, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0,
  ]);
  expect(sdk.writes.filter((w) => w.id === 1101)).toHaveLength(1);
  await expect(
    a.setColor(d!.zones[2]!.id!, { r: 1, g: 2, b: 3 }),
  ).rejects.toThrow();
});
it('gives zones stable IDs across reorder and refuses ambiguous/global-only layouts', () => {
  const first = parseController(
      controller('Hub', 'a', true, [
        { name: 'Fan', count: 2 },
        { name: 'Cooler', count: 3 },
      ]),
      0,
    ),
    second = parseController(
      controller('Hub', 'a', true, [
        { name: 'Cooler', count: 3 },
        { name: 'Fan', count: 2 },
      ]),
      3,
    );
  expect(first.device.zones[0]!.id).toBe(second.device.zones[1]!.id);
  expect(
    parseController(
      controller('Hub', 'a', true, [
        { name: 'X', count: 1 },
        { name: 'X', count: 1 },
      ]),
      0,
    ).zoneSafe,
  ).toBe(false);
  expect(
    parseController(controller('Hub', 'a', true, undefined, 32 | 1024), 0)
      .zoneSafe,
  ).toBe(false);
});
it('coalesces slider commands while preserving the latest hue, saturation and brightness', async () => {
  vi.useFakeTimers();
  const dir = temp(),
    a = new MockRGBAdapter(),
    m = new DeviceManager(a, defaultConfig(true), new StateStore(dir));
  cleanups.push(() => m.stop());
  await m.start();
  const spy = vi.spyOn(a, 'setColor');
  const requests = [
    m.request(virtualDevice.id, { on: true }),
    m.request(virtualDevice.id, { hue: 120 }),
    m.request(virtualDevice.id, { saturation: 100 }),
    m.request(virtualDevice.id, { brightness: 20 }),
    m.request(virtualDevice.id, { brightness: 50 }),
  ];
  await vi.advanceTimersByTimeAsync(35);
  await Promise.all(requests);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(a.colors.get(virtualDevice.id)).toEqual({ r: 0, g: 128, b: 0 });
});
it('reports partial group failure, retains successful member state and rejects whole-group success', async () => {
  const dir = temp(),
    a = new MockRGBAdapter(),
    other = { ...structuredClone(virtualDevice), id: 'mock:other' };
  a.devices.push(other);
  const c = defaultConfig(true);
  c.devices = [];
  c.groups = [
    {
      id: 'group:desk',
      name: 'Desk',
      enabled: true,
      members: [virtualDevice.id, other.id],
    },
  ];
  const m = new DeviceManager(a, c, new StateStore(dir));
  cleanups.push(() => m.stop());
  await m.start();
  const original = a.setColor.bind(a);
  vi.spyOn(a, 'setColor').mockImplementation(async (id, color) => {
    if (id === other.id) throw new Error('Disconnected');
    await original(id, color);
  });
  await expect(
    m.set('group:desk', { on: true, hue: 240, saturation: 100 }),
  ).rejects.toBeInstanceOf(GroupCommandError);
  expect(m.lastFailure?.failed).toEqual([other.id]);
  expect(m.lastFailure?.accepted).toEqual([virtualDevice.id]);
  expect(m.store.get('group:desk').on).toBe(false);
  expect(m.store.get(virtualDevice.id).on).toBe(true);
});
it('synchronizes all group members on successful commands', async () => {
  const dir = temp(),
    a = new MockRGBAdapter(),
    other = { ...structuredClone(virtualDevice), id: 'mock:second' };
  a.devices.push(other);
  const config = defaultConfig(true);
  config.devices = [];
  config.groups = [
    {
      id: 'group:all',
      name: 'All Lights',
      enabled: true,
      members: [virtualDevice.id, other.id],
    },
  ];
  const m = new DeviceManager(a, config, new StateStore(dir));
  cleanups.push(() => m.stop());
  await m.start();
  await m.set('group:all', {
    on: true,
    hue: 120,
    saturation: 100,
    brightness: 25,
  });
  expect(a.colors.get(virtualDevice.id)).toEqual({ r: 0, g: 64, b: 0 });
  expect(a.colors.get(other.id)).toEqual({ r: 0, g: 64, b: 0 });
  expect(m.store.get('group:all').on).toBe(true);
});
it('retains Unicode profile paths in a Windows-compatible UTF-16 launcher', () => {
  const dir = join(temp(), '灯光'),
    appdata = temp();
  mkdirSync(dir);
  setStartup(
    dir,
    true,
    process.execPath,
    join(dir, 'bridge.js'),
    appdata,
    'win32',
  );
  const path = startupFile(dir, appdata);
  expect([...readFileSync(path).subarray(0, 2)]).toEqual([255, 254]);
  expect(readLauncher(path)).toContain('灯光');
  setStartup(dir, false, process.execPath, 'entry', appdata, 'win32');
});
