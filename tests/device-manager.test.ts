import { afterEach, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockRGBAdapter, virtualDevice } from '../src/adapters/mock-adapter.js';
import { DeviceManager, retryDelay } from '../src/devices/device-manager.js';
import { defaultConfig } from '../src/config/config-manager.js';
import { StateStore } from '../src/config/state-store.js';
const paths: string[] = [];
const managers: DeviceManager[] = [];
async function setup(adapter = new MockRGBAdapter()) {
  const p = mkdtempSync(join(tmpdir(), 'rgb-manager-'));
  paths.push(p);
  const m = new DeviceManager(adapter, defaultConfig(true), new StateStore(p));
  managers.push(m);
  await m.start();
  return { m, adapter, p };
}
afterEach(async () => {
  for (const m of managers.splice(0)) await m.stop();
  for (const p of paths.splice(0)) rmSync(p, { recursive: true, force: true });
  vi.useRealTimers();
});
it('maps HomeKit state, preserves color while off, serializes updates', async () => {
  const { m, adapter } = await setup();
  const id = virtualDevice.id;
  await Promise.all([
    m.set(id, { on: true }),
    m.set(id, { hue: 120 }),
    m.set(id, { saturation: 100 }),
    m.set(id, { brightness: 50 }),
  ]);
  expect(adapter.colors.get(id)).toEqual({ r: 0, g: 128, b: 0 });
  await m.set(id, { on: false });
  expect(adapter.colors.get(id)).toEqual({ r: 0, g: 0, b: 0 });
  await m.set(id, { on: true });
  expect(adapter.colors.get(id)).toEqual({ r: 0, g: 128, b: 0 });
});
it('rejects unavailable, disabled and invalid commands without changing persisted state', async () => {
  const { m } = await setup();
  await expect(m.set('missing', { on: true })).rejects.toThrow();
  await expect(m.set(virtualDevice.id, { brightness: 101 })).rejects.toThrow();
  expect(m.store.get(virtualDevice.id).on).toBe(false);
  m.config.devices[0]!.enabled = false;
  await expect(m.set(virtualDevice.id, { on: true })).rejects.toThrow();
});
it('reports disappearance, restores desired state on reappearance', async () => {
  vi.useFakeTimers();
  const { m, adapter } = await setup();
  await m.set(virtualDevice.id, { on: true, hue: 240, saturation: 100 });
  adapter.devices = [];
  await vi.advanceTimersByTimeAsync(5000);
  expect(m.isAvailable(virtualDevice.id)).toBe(false);
  await expect(m.set(virtualDevice.id, { on: false })).rejects.toThrow();
  adapter.colors.clear();
  adapter.devices = [structuredClone(virtualDevice)];
  await vi.advanceTimersByTimeAsync(5000);
  expect(m.isAvailable(virtualDevice.id)).toBe(true);
  expect(adapter.colors.get(virtualDevice.id)).toEqual({ r: 0, g: 0, b: 255 });
});
it('recovers from connection failures with bounded backoff and stops timers', async () => {
  vi.useFakeTimers();
  const adapter = new MockRGBAdapter();
  const connect = vi
    .spyOn(adapter, 'connect')
    .mockRejectedValueOnce(new Error('offline'))
    .mockRejectedValueOnce(new Error('offline'));
  const { m } = await setup(adapter);
  expect(m.isAvailable(virtualDevice.id)).toBe(false);
  await vi.advanceTimersByTimeAsync(1000);
  expect(connect).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(2000);
  expect(connect).toHaveBeenCalledTimes(3);
  expect(m.isAvailable(virtualDevice.id)).toBe(true);
  await m.stop();
  expect(vi.getTimerCount()).toBe(0);
  expect([0, 1, 2, 10, 99].map((n) => retryDelay(n, 1000, 30000))).toEqual([
    1000, 2000, 4000, 30000, 30000,
  ]);
});
it('restores state into an adapter after a manager restart', async () => {
  const { m, p } = await setup();
  await m.set(virtualDevice.id, { on: true, hue: 60, saturation: 100 });
  await m.stop();
  const adapter = new MockRGBAdapter();
  const next = new DeviceManager(
    adapter,
    defaultConfig(true),
    new StateStore(p),
  );
  managers.push(next);
  await next.start();
  expect(adapter.colors.get(virtualDevice.id)).toEqual({
    r: 255,
    g: 255,
    b: 0,
  });
});
it('does not persist a failed write and reports unavailable', async () => {
  const { m, adapter } = await setup();
  vi.spyOn(adapter, 'setColor').mockRejectedValueOnce(
    new Error('write failed'),
  );
  await expect(m.set(virtualDevice.id, { on: true })).rejects.toThrow();
  expect(m.store.get(virtualDevice.id).on).toBe(false);
  expect(m.isAvailable(virtualDevice.id)).toBe(false);
});
it('validates device capabilities', async () => {
  const { m, adapter } = await setup();
  adapter.devices[0]!.capabilities.brightness = 'none';
  vi.useFakeTimers();
  await m.cycle();
  await expect(m.set(virtualDevice.id, { brightness: 50 })).rejects.toThrow(
    'Brightness unsupported',
  );
});
it('mock validates connection, identity and channels', async () => {
  const a = new MockRGBAdapter();
  await expect(a.discoverDevices()).rejects.toThrow();
  await a.connect();
  await expect(a.setColor('missing', { r: 0, g: 0, b: 0 })).rejects.toThrow();
  await expect(
    a.setColor(virtualDevice.id, { r: 999, g: 0, b: 0 }),
  ).rejects.toThrow();
});
