import { createServer, type Socket } from 'node:net';
import { packet, uint32 } from '../src/adapters/openrgb-protocol.js';
export function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
export function str(s: string): Buffer {
  const b = Buffer.from(s + '\0');
  return Buffer.concat([u16(b.length), b]);
}
export function controller(
  name = 'Test Light',
  serial = 'unique',
  direct = true,
  zones = [{ name: 'Zone', count: 2 }],
  flags = 32,
): Buffer {
  const leds = zones.reduce((n, z) => n + z.count, 0);
  const mode = Buffer.concat([
    str(direct ? 'Direct' : 'Rainbow'),
    ...[0, direct ? flags : 0, 0, 0, 0, 100, 0, 0, 0, 100, 0, 1].map(uint32),
    u16(0),
  ]);
  const body = Buffer.concat([
    uint32(2),
    str(name),
    str('Test Vendor'),
    str('Test controller'),
    str('1'),
    str(serial),
    str('test-port'),
    u16(1),
    uint32(0),
    mode,
    u16(zones.length),
    ...zones.map((z) =>
      Buffer.concat([
        str(z.name),
        uint32(0),
        uint32(z.count),
        uint32(z.count),
        uint32(z.count),
        u16(0),
      ]),
    ),
    u16(leds),
    ...Array.from({ length: leds }, (_, i) =>
      Buffer.concat([str('LED ' + i), uint32(i)]),
    ),
    u16(leds),
    Buffer.alloc(leds * 4),
  ]);
  return Buffer.concat([uint32(body.length + 4), body]);
}
export async function sdkServer() {
  const clients = new Set<Socket>();
  const writes: { device: number; id: number; body: Buffer }[] = [];
  const state = {
    controllers: [controller()],
    silent: false,
    version: 3,
    fragment: false,
  };
  const server = createServer((socket) => {
    clients.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => clients.delete(socket));
    let input: Buffer = Buffer.alloc(0);
    socket.on('data', (data: Buffer) => {
      input = Buffer.concat([input, data]);
      while (
        input.length >= 16 &&
        input.length >= 16 + input.readUInt32LE(12)
      ) {
        const size = input.readUInt32LE(12),
          device = input.readUInt32LE(4),
          id = input.readUInt32LE(8),
          body = Buffer.from(input.subarray(16, 16 + size));
        input = input.subarray(16 + size);
        writes.push({ device, id, body });
        if (state.silent) continue;
        const result =
          id === 40
            ? uint32(state.version)
            : id === 0
              ? uint32(state.controllers.length)
              : id === 1
                ? state.controllers[device]
                : undefined;
        if (result) {
          const response = packet(device, id, result);
          if (state.fragment) {
            socket.write(response.subarray(0, 7));
            setTimeout(() => {
              if (!socket.destroyed) socket.write(response.subarray(7));
            }, 2);
          } else socket.write(response);
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test port');
  return {
    port: address.port,
    writes,
    state,
    notify: () => {
      for (const s of clients) s.write(packet(0, 100));
    },
    drop: () => {
      for (const s of clients) s.destroy();
    },
    close: async () => {
      for (const s of clients) s.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    },
  };
}
