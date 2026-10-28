import { createConnection, type Socket } from 'node:net';
import type { RGBAdapter } from './rgb-adapter.js';
import type { RGBColor, RGBDevice } from '../devices/device-types.js';
import { validateRGB } from '../utils/color.js';
import {
  packet,
  parseController,
  uint32,
  type Controller,
} from './openrgb-protocol.js';
interface Pending {
  id: number;
  device: number;
  resolve: (data: Buffer) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}
export class OpenRGBAdapter implements RGBAdapter {
  private socket?: Socket;
  private input: Buffer = Buffer.alloc(0);
  private pending?: Pending;
  private controllers = new Map<string, Controller>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private host = '127.0.0.1',
    private port = 6742,
    private timeoutMs = 3000,
  ) {}
  isConnected(): boolean {
    return (
      !!this.socket &&
      !this.socket.destroyed &&
      this.socket.readyState === 'open'
    );
  }
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => {});
    return result;
  }
  async connect(): Promise<void> {
    await this.disconnect();
    const socket = createConnection({ host: this.host, port: this.port });
    this.socket = socket;
    socket.setNoDelay(true);
    socket.on('data', (data: Buffer) => {
      if (this.socket === socket) this.receive(data);
    });
    socket.on('error', () => {
      if (this.socket === socket) this.fail();
    });
    socket.on('close', () => {
      if (this.socket === socket) this.fail();
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          socket.destroy();
          reject(new Error('OpenRGB connect timeout'));
        }, this.timeoutMs);
        socket.once('connect', () => {
          clearTimeout(timer);
          resolve();
        });
        socket.once('error', () => {
          clearTimeout(timer);
          reject(new Error('OpenRGB connection failed'));
        });
      });
      const version = await this.request(0, 40, uint32(3));
      if (version.length !== 4 || version.readUInt32LE() < 3)
        throw new Error('OpenRGB protocol 3 or newer required');
      await this.send(0, 50, Buffer.from('HomeKit RGB Bridge\0'));
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }
  private fail(): void {
    this.controllers.clear();
    this.input = Buffer.alloc(0);
    const pending = this.pending;
    this.pending = undefined;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('OpenRGB disconnected or inventory changed'));
    }
    this.socket?.destroy();
  }
  async disconnect(): Promise<void> {
    this.fail();
    this.socket = undefined;
  }
  private receive(data: Buffer): void {
    this.input = Buffer.concat([this.input, data]);
    while (this.input.length >= 16) {
      const size = this.input.readUInt32LE(12);
      if (
        this.input.toString('ascii', 0, 4) !== 'ORGB' ||
        size > 8 * 1024 * 1024
      ) {
        this.fail();
        return;
      }
      if (this.input.length < 16 + size) return;
      const id = this.input.readUInt32LE(8),
        device = this.input.readUInt32LE(4),
        body = Buffer.from(this.input.subarray(16, 16 + size));
      this.input = this.input.subarray(16 + size);
      // Index-based protocol: invalidate immediately rather than risk writing to a shifted device index.
      if (id === 100) {
        this.fail();
        return;
      }
      if (this.pending?.id === id && this.pending.device === device) {
        const p = this.pending;
        this.pending = undefined;
        clearTimeout(p.timer);
        p.resolve(body);
      }
    }
  }
  private send(
    device: number,
    id: number,
    data: Buffer = Buffer.alloc(0),
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        reject(new Error('OpenRGB unavailable'));
        return;
      }
      const socket = this.socket!;
      const timer = setTimeout(() => {
        if (this.socket === socket) this.fail();
        reject(new Error('OpenRGB write timeout'));
      }, this.timeoutMs);
      socket.write(packet(device, id, data), (error) => {
        clearTimeout(timer);
        if (error) reject(new Error('OpenRGB write failed'));
        else resolve();
      });
    });
  }
  private request(
    device: number,
    id: number,
    data: Buffer = Buffer.alloc(0),
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (this.pending) {
        reject(new Error('Concurrent OpenRGB request'));
        return;
      }
      const timer = setTimeout(() => this.fail(), this.timeoutMs);
      this.pending = { id, device, resolve, reject, timer };
      void this.send(device, id, data).catch(() => this.fail());
    });
  }
  discoverDevices(): Promise<RGBDevice[]> {
    return this.serial(async () => {
      const countData = await this.request(0, 0);
      if (countData.length !== 4 || countData.readUInt32LE() > 512)
        throw new Error('Invalid OpenRGB device count');
      const all: Controller[] = [];
      for (let i = 0; i < countData.readUInt32LE(); i++)
        all.push(parseController(await this.request(i, 1, uint32(3)), i));
      this.controllers.clear();
      const ids = new Set<string>(),
        duplicates = new Set<string>();
      for (const c of all) {
        if (ids.has(c.device.id)) duplicates.add(c.device.id);
        ids.add(c.device.id);
      }
      for (const c of all) {
        if (duplicates.has(c.device.id))
          c.device.capabilities = {
            color: false,
            brightness: 'none',
            power: 'none',
            independentZones: false,
            reason:
              'Ambiguous identity: identical devices without distinct serial/location',
          };
        else this.controllers.set(c.device.id, c);
      }
      return all.map((c) => c.device);
    });
  }
  setColor(id: string, color: RGBColor): Promise<void> {
    return this.serial(async () => {
      validateRGB(color);
      const c = this.controllers.get(id);
      if (
        !c?.device.capabilities.color ||
        !c.directMode ||
        c.directIndex === undefined
      )
        throw new Error('Unsupported or unavailable OpenRGB device');
      const mode = Buffer.concat([
        uint32(8 + c.directMode.length),
        uint32(c.directIndex),
        c.directMode,
      ]);
      await this.send(c.index, 1101, mode);
      const data = Buffer.alloc(6 + c.ledCount * 4);
      data.writeUInt32LE(data.length);
      data.writeUInt16LE(c.ledCount, 4);
      for (let i = 0; i < c.ledCount; i++) {
        data[6 + i * 4] = color.r;
        data[7 + i * 4] = color.g;
        data[8 + i * 4] = color.b;
      }
      await this.send(c.index, 1050, data);
    });
  }
}
