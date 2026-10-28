import { afterEach, it, expect, vi } from 'vitest';
import { OpenRGBAdapter } from '../src/adapters/openrgb-adapter.js';
import { parseController } from '../src/adapters/openrgb-protocol.js';
import { controller, sdkServer } from './openrgb-fixture.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
async function setup() {
  const server = await sdkServer();
  cleanup.push(server.close);
  const a = new OpenRGBAdapter('127.0.0.1', server.port, 200);
  cleanup.push(() => a.disconnect());
  await a.connect();
  return { server, a };
}
it('negotiates protocol, handles fragmented responses, enumerates zones and sends exact RGB bytes', async () => {
  const { server, a } = await setup();
  server.state.fragment = true;
  const [d] = await a.discoverDevices();
  expect(d!.zones).toEqual([{ name: 'Zone', ledCount: 2 }]);
  expect(d!.capabilities.brightness).toBe('software');
  await a.setColor(d!.id, { r: 18, g: 52, b: 86 });
  await vi.waitFor(() =>
    expect(server.writes.some((w) => w.id === 1050)).toBe(true),
  );
  const mode = server.writes.find((w) => w.id === 1101)!;
  expect(mode.body.readUInt32LE()).toBe(mode.body.length);
  expect(mode.body.readUInt32LE(4)).toBe(0);
  const led = server.writes.find((w) => w.id === 1050)!;
  expect([...led.body.subarray(4)]).toEqual([
    2, 0, 18, 52, 86, 0, 18, 52, 86, 0,
  ]);
  expect(server.writes.find((w) => w.id === 1)!.body.readUInt32LE()).toBe(3);
});
it('keeps identities stable across index reorder and routes correctly', async () => {
  const { server, a } = await setup();
  server.state.controllers = [controller('A', 'a'), controller('B', 'b')];
  const devices = await a.discoverDevices();
  server.state.controllers.reverse();
  const reordered = await a.discoverDevices();
  expect(devices[0]!.id).toBe(reordered[1]!.id);
  await a.setColor(devices[0]!.id, { r: 1, g: 2, b: 3 });
  await vi.waitFor(() =>
    expect(server.writes.find((w) => w.id === 1050)?.device).toBe(1),
  );
});
it('rejects unsupported Direct modes, malformed data and ambiguous identities', async () => {
  expect(
    parseController(controller('A', 'a', false), 0).device.capabilities.color,
  ).toBe(false);
  expect(() => parseController(controller().subarray(0, 40), 0)).toThrow();
  const { server, a } = await setup();
  server.state.controllers = [controller(), controller()];
  const devices = await a.discoverDevices();
  expect(devices.every((d) => !d.capabilities.color)).toBe(true);
  await expect(
    a.setColor(devices[0]!.id, { r: 0, g: 0, b: 0 }),
  ).rejects.toThrow();
});
it('fails closed on a device-list notification, reconnects without stale-close races', async () => {
  const { server, a } = await setup();
  const [d] = await a.discoverDevices();
  server.notify();
  await vi.waitFor(() => expect(a.isConnected()).toBe(false));
  await expect(a.setColor(d!.id, { r: 0, g: 0, b: 0 })).rejects.toThrow();
  await a.connect();
  await a.discoverDevices();
  expect(a.isConnected()).toBe(true);
  await a.disconnect();
  await a.connect();
  await a.discoverDevices();
  expect(a.isConnected()).toBe(true);
});
it('times out requests and rejects pending requests on disconnect', async () => {
  const { server, a } = await setup();
  server.state.silent = true;
  await expect(a.discoverDevices()).rejects.toThrow();
  expect(a.isConnected()).toBe(false);
});
it('supports newer servers using protocol-3 payloads; rejects old protocols', async () => {
  const { server, a } = await setup();
  await a.disconnect();
  server.state.version = 6;
  await a.connect();
  expect((await a.discoverDevices()).length).toBe(1);
  await a.disconnect();
  server.state.version = 2;
  await expect(a.connect()).rejects.toThrow('protocol 3');
});
it('rejects invalid channels before sending hardware commands', async () => {
  const { a } = await setup();
  const [d] = await a.discoverDevices();
  await expect(a.setColor(d!.id, { r: 256, g: 0, b: 0 })).rejects.toThrow();
});
