import { EventEmitter } from 'node:events';
import type { RGBAdapter } from '../adapters/rgb-adapter.js';
import type { Config } from '../config/config-manager.js';
import { StateStore, lightStateSchema } from '../config/state-store.js';
import { stateToRGB } from '../utils/color.js';
import { Logger } from '../utils/logger.js';
import type { LightState, RGBDevice } from './device-types.js';
export function retryDelay(
  attempt: number,
  initial: number,
  max: number,
): number {
  return Math.min(max, initial * 2 ** Math.min(attempt, 20));
}
export class DeviceManager extends EventEmitter {
  private available = new Map<string, RGBDevice>();
  private timer?: NodeJS.Timeout;
  private attempt = 0;
  private running = false;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    readonly adapter: RGBAdapter,
    readonly config: Config,
    readonly store: StateStore,
    private logger = new Logger(config.logging),
  ) {
    super();
  }
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const p = this.queue.then(task);
    this.queue = p.catch(() => {});
    return p;
  }
  isAvailable(id: string): boolean {
    return (
      this.adapter.isConnected() && !!this.available.get(id)?.capabilities.color
    );
  }
  state(id: string): LightState {
    if (!this.isAvailable(id)) throw new Error('Device unavailable');
    return this.store.get(id);
  }
  async start(): Promise<void> {
    this.running = true;
    await this.cycle();
  }
  async stop(): Promise<void> {
    this.running = false;
    clearTimeout(this.timer);
    await this.queue;
    await this.adapter.disconnect();
  }
  async cycle(): Promise<void> {
    let delay = this.config.connection.pollMs;
    await this.serial(async () => {
      if (!this.running) return;
      try {
        const reconnect = !this.adapter.isConnected();
        if (reconnect) await this.adapter.connect();
        const old = this.available;
        const devices = await this.adapter.discoverDevices();
        this.available = new Map(devices.map((d) => [d.id, d]));
        for (const device of this.config.devices.filter((d) => d.enabled)) {
          if (this.isAvailable(device.id) && (reconnect || !old.has(device.id)))
            await this.adapter.setColor(
              device.id,
              stateToRGB(this.store.get(device.id)),
            );
        }
        if (this.attempt || reconnect)
          this.logger.log('info', 'adapter_connected');
        this.attempt = 0;
        this.emit('availability');
      } catch {
        this.available.clear();
        await this.adapter.disconnect();
        this.emit('availability');
        if (this.attempt === 0)
          this.logger.log('error', 'adapter_unavailable_retrying');
        delay = retryDelay(
          this.attempt++,
          this.config.connection.initialRetryMs,
          this.config.connection.maxRetryMs,
        );
      }
    });
    if (this.running)
      this.timer = setTimeout(() => {
        void this.cycle().catch(() =>
          this.logger.log('error', 'reconnect_cycle_failed'),
        );
      }, delay);
  }
  set(id: string, patch: Partial<LightState>): Promise<void> {
    return this.serial(async () => {
      if (
        !this.config.devices.some((d) => d.id === id && d.enabled) ||
        !this.isAvailable(id)
      )
        throw new Error('Device unavailable');
      const state = lightStateSchema.parse({ ...this.store.get(id), ...patch });
      const device = this.available.get(id)!;
      if (
        patch.brightness !== undefined &&
        device.capabilities.brightness === 'none'
      )
        throw new Error('Brightness unsupported');
      if (patch.on !== undefined && device.capabilities.power === 'none')
        throw new Error('Power unsupported');
      try {
        await this.adapter.setColor(id, stateToRGB(state));
      } catch (error) {
        this.available.delete(id);
        this.emit('availability');
        throw error;
      }
      // Last transport-accepted desired state, never physical readback.
      this.store.set(id, state);
      this.emit('state', id, state);
      this.logger.log('debug', 'light_command_sent');
    });
  }
}
