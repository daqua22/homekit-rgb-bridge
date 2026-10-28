import { createHash } from 'node:crypto';
import type { RGBDevice } from '../devices/device-types.js';
/** Independently implemented protocol-3 subset. See docs/architecture.md for upstream references. */
export function uint32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}
export function packet(
  device: number,
  id: number,
  data: Buffer = Buffer.alloc(0),
): Buffer {
  const header = Buffer.alloc(16);
  header.write('ORGB');
  header.writeUInt32LE(device, 4);
  header.writeUInt32LE(id, 8);
  header.writeUInt32LE(data.length, 12);
  return Buffer.concat([header, data]);
}
class Reader {
  offset = 0;
  constructor(private data: Buffer) {}
  take(n: number): Buffer {
    if (n < 0 || this.offset + n > this.data.length)
      throw new Error('Malformed OpenRGB payload');
    const out = this.data.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }
  u16(): number {
    return this.take(2).readUInt16LE();
  }
  u32(): number {
    return this.take(4).readUInt32LE();
  }
  string(): string {
    const bytes = this.take(this.u16());
    if (bytes.length < 1 || bytes.at(-1) !== 0)
      throw new Error('Malformed OpenRGB string');
    return bytes.subarray(0, -1).toString('utf8');
  }
}
export interface Controller {
  device: RGBDevice;
  index: number;
  ledCount: number;
  directMode?: Buffer;
  directIndex?: number;
}
export function parseController(data: Buffer, index: number): Controller {
  const r = new Reader(data);
  if (r.u32() !== data.length)
    throw new Error('OpenRGB controller size mismatch');
  const type = r.u32(),
    name = r.string(),
    vendor = r.string();
  r.string();
  r.string();
  const serial = r.string(),
    location = r.string();
  const numModes = r.u16();
  r.u32();
  let directMode: Buffer | undefined, directIndex: number | undefined;
  for (let m = 0; m < numModes; m++) {
    const start = r.offset,
      modeName = r.string(),
      base = r.offset;
    r.u32();
    const flags = r.u32();
    r.take(8);
    r.u32();
    const brightnessMax = r.u32();
    r.take(12);
    r.u32();
    r.u32();
    r.u32();
    const count = r.u16();
    r.take(count * 4);
    if (
      modeName.toLowerCase() === 'direct' &&
      (flags & 32) !== 0 &&
      directMode === undefined
    ) {
      directMode = Buffer.from(data.subarray(start, r.offset));
      directIndex = m;
      // Protocol 3 mode: brightness at field 9; color mode at field 11.
      directMode.writeUInt32LE(brightnessMax, base - start + 36);
      directMode.writeUInt32LE(1, base - start + 44);
    }
  }
  const zones: RGBDevice['zones'] = [];
  const zoneCount = r.u16();
  for (let z = 0; z < zoneCount; z++) {
    const zoneName = r.string();
    r.take(12);
    const count = r.u32();
    r.take(r.u16());
    zones.push({ name: zoneName, ledCount: count });
  }
  const ledCount = r.u16();
  for (let led = 0; led < ledCount; led++) {
    r.string();
    r.u32();
  }
  const colorCount = r.u16();
  r.take(colorCount * 4);
  if (r.offset !== data.length)
    throw new Error('Unexpected protocol-3 controller data');
  const id =
    'openrgb:' +
    createHash('sha256')
      .update(JSON.stringify([vendor, name, type, serial || location]))
      .digest('hex')
      .slice(0, 24);
  const supported =
    directMode !== undefined && ledCount > 0 && colorCount === ledCount;
  return {
    index,
    ledCount,
    directMode,
    directIndex,
    device: {
      id,
      name,
      manufacturer: vendor || 'Unknown',
      zones,
      capabilities: {
        color: supported,
        brightness: supported ? 'software' : 'none',
        power: supported ? 'software' : 'none',
        independentZones: false,
        ...(supported
          ? {}
          : {
              reason:
                'Requires a Direct mode with per-LED color and matching LED/color counts',
            }),
      },
    },
  };
}
