import { afterEach, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Characteristic, Service, HAPStatus } from '@homebridge/hap-nodejs';
import { createLight, accessoryID } from '../src/homekit/light-accessory.js';
import { DeviceManager } from '../src/devices/device-manager.js';
import { MockRGBAdapter, virtualDevice } from '../src/adapters/mock-adapter.js';
import { defaultConfig } from '../src/config/config-manager.js';
import { StateStore } from '../src/config/state-store.js';
const dirs: string[] = [],
  managers: DeviceManager[] = [];
afterEach(async () => {
  for (const m of managers.splice(0)) await m.stop();
  for (const p of dirs.splice(0)) rmSync(p, { recursive: true, force: true });
});
it('generates stable accessory UUIDs independent of enumeration order', () => {
  expect(accessoryID('a')).toBe(accessoryID('a'));
  expect(accessoryID('a')).not.toBe(accessoryID('b'));
});
it('executes actual HAP characteristic handlers and surfaces unavailable errors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rgb-hap-'));
  dirs.push(dir);
  const adapter = new MockRGBAdapter(),
    manager = new DeviceManager(
      adapter,
      defaultConfig(true),
      new StateStore(dir),
    );
  managers.push(manager);
  await manager.start();
  const accessory = createLight(virtualDevice.id, 'Test RGB', manager),
    service = accessory.getService(Service.Lightbulb)!;
  await service.getCharacteristic(Characteristic.On).handleSetRequest(true);
  await service.getCharacteristic(Characteristic.Hue).handleSetRequest(240);
  await service
    .getCharacteristic(Characteristic.Saturation)
    .handleSetRequest(100);
  await service
    .getCharacteristic(Characteristic.Brightness)
    .handleSetRequest(25);
  expect(adapter.colors.get(virtualDevice.id)).toEqual({ r: 0, g: 0, b: 64 });
  expect(
    await service.getCharacteristic(Characteristic.On).handleGetRequest(),
  ).toBe(true);
  await adapter.disconnect();
  await expect(
    service.getCharacteristic(Characteristic.On).handleGetRequest(),
  ).rejects.toBe(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
});
