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
export function configuredLights(
  config: Config,
): { id: string; name: string; members: string[] }[] {
  return [
    ...config.devices
      .filter((d) => d.enabled)
      .map((d) => ({ id: d.id, name: d.name, members: [d.id] })),
    ...config.groups
      .filter((g) => g.enabled)
      .map((g) => ({ id: g.id, name: g.name, members: g.members })),
  ];
}
export class GroupCommandError extends Error {
  constructor(
    readonly failed: string[],
    readonly accepted: string[],
  ) {
    super('Some group members could not be updated');
  }
}
interface Pending {
  patch: Partial<LightState>;
  waiters: { resolve: () => void; reject: (e: unknown) => void }[];
  timer: NodeJS.Timeout;
}
export class DeviceManager extends EventEmitter {
  private available = new Map<string, RGBDevice>();
  private timer?: NodeJS.Timeout;
  private attempt = 0;
  private running = false;
  private queue: Promise<unknown> = Promise.resolve();
  private pending = new Map<string, Pending>();
  lastFailure?: { light: string; failed: string[]; accepted: string[] };
  connectionStatus = 'stopped';
  constructor(
    readonly adapter: RGBAdapter,
    readonly config: Config,
    readonly store: StateStore,
    private logger = new Logger(config.logging),
  ) {
    super();
    this.setMaxListeners(0);
  }
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const p = this.queue.then(task);
    this.queue = p.catch(() => {});
    return p;
  }
  inventory(): RGBDevice[] {
    return structuredClone(
      [...this.available.values()].filter((d) => !d.id.includes(':zone:')),
    );
  }
  private targets(id: string): string[] {
    return (
      configuredLights(this.config).find((l) => l.id === id)?.members ?? []
    );
  }
  private targetAvailable(id: string): boolean {
    return (
      this.adapter.isConnected() && !!this.available.get(id)?.capabilities.color
    );
  }
  isAvailable(id: string): boolean {
    const members = this.targets(id);
    return members.length > 0 && members.every((m) => this.targetAvailable(m));
  }
  state(id: string): LightState {
    if (!this.isAvailable(id)) throw new Error('Device unavailable');
    return this.store.get(id);
  }
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.cycle();
  }
  async stop(): Promise<void> {
    this.running = false;
    clearTimeout(this.timer);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      for (const w of pending.waiters) w.reject(new Error('Bridge stopped'));
    }
    this.pending.clear();
    await this.queue;
    await this.adapter.disconnect();
    this.connectionStatus = 'stopped';
  }
  async cycle(): Promise<void> {
    clearTimeout(this.timer);
    let delay = this.config.connection.pollMs;
    await this.serial(async () => {
      if (!this.running) return;
      try {
        const reconnect = !this.adapter.isConnected();
        if (reconnect) await this.adapter.connect();
        const old = this.available,
          devices = await this.adapter.discoverDevices();
        this.available = new Map(devices.map((d) => [d.id, d]));
        if (this.config.experimentalZones)
          for (const d of devices)
            for (const z of d.zones)
              if (z.id && z.controllable)
                this.available.set(z.id, {
                  ...d,
                  id: z.id,
                  name: d.name + ' ' + z.name,
                  zones: [z],
                });
        for (const light of configuredLights(this.config)) {
          if (
            this.isAvailable(light.id) &&
            (reconnect || light.members.some((m) => !old.has(m)))
          )
            await this.apply(light.id, this.store.get(light.id), false);
        }
        if (this.attempt || reconnect)
          this.logger.log('info', 'adapter_connected');
        this.attempt = 0;
        this.connectionStatus = 'connected';
        this.emit('availability');
      } catch {
        this.available.clear();
        await this.adapter.disconnect();
        this.connectionStatus = 'retrying';
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
  private async apply(
    id: string,
    state: LightState,
    persist = true,
  ): Promise<void> {
    const failed: string[] = [],
      accepted: string[] = [];
    for (const target of this.targets(id)) {
      try {
        if (!this.targetAvailable(target)) throw new Error('Unavailable');
        await this.adapter.setColor(target, stateToRGB(state));
        if (persist && target !== id) this.store.set(target, state);
        accepted.push(target);
      } catch {
        failed.push(target);
        this.available.delete(target);
      }
    }
    if (failed.length) {
      this.lastFailure = { light: id, failed, accepted };
      this.emit('availability');
      throw new GroupCommandError(failed, accepted);
    }
    if (persist) this.store.set(id, state);
    if (persist) this.lastFailure = undefined;
    this.emit('state', id, state);
    this.logger.log('debug', 'light_command_sent');
  }
  set(id: string, patch: Partial<LightState>): Promise<void> {
    return this.serial(async () => {
      if (!this.isAvailable(id)) throw new Error('Device unavailable');
      const state = lightStateSchema.parse({ ...this.store.get(id), ...patch });
      for (const member of this.targets(id)) {
        const device = this.available.get(member)!;
        if (
          patch.brightness !== undefined &&
          device.capabilities.brightness === 'none'
        )
          throw new Error('Brightness unsupported');
        if (patch.on !== undefined && device.capabilities.power === 'none')
          throw new Error('Power unsupported');
      }
      await this.apply(id, state);
    });
  }
  /** Coalesce slider writes for 35ms. Every caller waits for the final merged transport result. */
  request(id: string, patch: Partial<LightState>): Promise<void> {
    try {
      lightStateSchema.partial().parse(patch);
    } catch (error) {
      return Promise.reject(error);
    }
    if (!this.running) return Promise.reject(new Error('Bridge stopped'));
    return new Promise((resolve, reject) => {
      let pending = this.pending.get(id);
      if (!pending) {
        pending = {
          patch: {},
          waiters: [],
          timer: setTimeout(() => {
            const p = this.pending.get(id);
            if (!p) return;
            this.pending.delete(id);
            void this.set(id, p.patch).then(
              () => p.waiters.forEach((w) => w.resolve()),
              (error) => p.waiters.forEach((w) => w.reject(error)),
            );
          }, 35),
        };
        this.pending.set(id, pending);
      }
      Object.assign(pending.patch, patch);
      pending.waiters.push({ resolve, reject });
    });
  }
}
