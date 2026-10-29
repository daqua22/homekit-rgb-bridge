import { VERSION } from '../version.js';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import QRCode from 'qrcode';
import {
  configSchema,
  loadConfig,
  saveConfig,
  backupInstallation,
  backupsCount,
  type Config,
} from '../config/config-manager.js';
import { StateStore } from '../config/state-store.js';
import { loadIdentity } from '../config/identity.js';
import { AccessoryManager } from '../homekit/accessory-manager.js';
import { DeviceManager, configuredLights } from '../devices/device-manager.js';
import { MockRGBAdapter } from '../adapters/mock-adapter.js';
import { OpenRGBAdapter } from '../adapters/openrgb-adapter.js';
import type { RGBAdapter } from '../adapters/rgb-adapter.js';
import type { RGBDevice } from '../devices/device-types.js';
import { Logger } from '../utils/logger.js';
import { startupEnabled, setStartup } from '../windows/startup.js';
export class UserError extends Error {}
export class AppController {
  config: Config;
  manager?: DeviceManager;
  homekit?: AccessoryManager;
  private detected: RGBDevice[] = [];
  private chain: Promise<unknown> = Promise.resolve();
  private restartRequired = false;
  lastError = '';
  logger: Logger;
  constructor(
    readonly dir: string,
    private adapterFactory?: (config: Config) => RGBAdapter,
  ) {
    this.config = loadConfig(dir);
    this.logger = new Logger(this.config.logging, dir);
  }
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(fn);
    this.chain = p.catch(() => {});
    return p;
  }
  private adapter(): RGBAdapter {
    return (
      this.adapterFactory?.(this.config) ??
      (this.config.adapter === 'mock'
        ? new MockRGBAdapter()
        : new OpenRGBAdapter(
            this.config.openrgb.host,
            this.config.openrgb.port,
            this.config.openrgb.timeoutMs,
          ))
    );
  }
  revision(): string {
    return createHash('sha256')
      .update(readFileSync(join(this.dir, 'config.json')))
      .digest('hex');
  }
  status() {
    return {
      version: VERSION,
      running: !!this.homekit,
      connection: this.manager?.connectionStatus ?? 'stopped',
      paired: this.homekit?.paired() ?? null,
      detectedDevices: this.manager?.inventory().length ?? this.detected.length,
      accessories: configuredLights(this.config).length,
      autostart: startupEnabled(this.dir),
      platform: process.platform,
      config: this.config,
      revision: this.revision(),
      dataDirectory: this.dir,
      backups: backupsCount(this.dir),
      restartRequired: this.restartRequired,
      lastError: this.lastError,
      groupFailure: this.manager?.lastFailure ?? null,
      lights: configuredLights(this.config).map((l) => ({
        id: l.id,
        name: l.name,
        available: this.manager?.isAvailable(l.id) ?? false,
        state: this.manager?.store.get(l.id) ?? null,
      })),
    };
  }
  private async startInternal(): Promise<void> {
    if (this.homekit) return;
    if (this.restartRequired)
      throw new UserError(
        'Quit and reopen the application after resetting pairing.',
      );
    let manager: DeviceManager | undefined,
      homekit: AccessoryManager | undefined;
    try {
      manager = new DeviceManager(
        this.adapter(),
        this.config,
        new StateStore(this.dir),
        this.logger,
      );
      homekit = new AccessoryManager(
        this.config,
        loadIdentity(this.dir),
        manager,
        this.dir,
      );
      this.manager = manager;
      await manager.start();
      await homekit.start();
      this.homekit = homekit;
      this.lastError = '';
      this.logger.log('info', 'bridge_started_experimental');
    } catch {
      try {
        await homekit?.stop();
      } finally {
        await manager?.stop();
        this.manager = undefined;
      }
      this.lastError =
        'Bridge could not start. Check its port, network interface, profile permissions and valid saved state/identity. Restore missing identity from a private backup rather than resetting existing pairing.';
      throw new UserError(this.lastError);
    }
  }

  private async stopInternal(): Promise<void> {
    const h = this.homekit,
      m = this.manager;
    this.homekit = undefined;
    this.manager = undefined;
    try {
      await h?.stop();
    } finally {
      await m?.stop();
    }
    this.logger.log('info', 'bridge_stopped');
  }
  start(): Promise<void> {
    return this.exclusive(() => this.startInternal());
  }
  stop(): Promise<void> {
    return this.exclusive(() => this.stopInternal());
  }
  restart(): Promise<void> {
    return this.exclusive(async () => {
      await this.stopInternal();
      await this.startInternal();
    });
  }
  discover(): Promise<RGBDevice[]> {
    return this.exclusive(async () => {
      if (this.manager) return this.manager.inventory();
      const adapter = this.adapter();
      try {
        await adapter.connect();
        this.detected = await adapter.discoverDevices();
        this.lastError = '';
        return this.detected;
      } catch {
        this.lastError =
          'OpenRGB discovery failed. Start its local SDK server, check host/port, and check PawnIO/administrator access if RAM is missing in OpenRGB.';
        throw new UserError(this.lastError);
      } finally {
        await adapter.disconnect();
      }
    });
  }
  save(value: unknown, revision: string, confirm: boolean): Promise<void> {
    return this.exclusive(async () => {
      if (!confirm)
        throw new UserError(
          'Confirm the configuration save; a private backup will be created.',
        );
      if (revision !== this.revision())
        throw new UserError('Configuration changed. Refresh before saving.');
      const config = configSchema.parse(value);
      if (config.admin.port !== this.config.admin.port)
        throw new UserError(
          'The control-panel port is fixed for this session; change it in a stopped source installation.',
        );
      const running = !!this.homekit;
      await this.stopInternal();
      this.config = saveConfig(this.dir, config);
      this.logger = new Logger(this.config.logging, this.dir);
      if (running) await this.startInternal();
    });
  }
  async pairing() {
    if (!this.homekit)
      throw new UserError(
        'Start the bridge before displaying private setup credentials.',
      );
    const p = this.homekit.pairing();
    return {
      pincode: p.pincode,
      qr: await QRCode.toDataURL(p.uri, { width: 256, margin: 2 }),
      paired: this.homekit.paired(),
    };
  }
  reset(confirmation: string): Promise<void> {
    return this.exclusive(async () => {
      if (confirmation !== 'RESET HOMEKIT PAIRING')
        throw new UserError('Type RESET HOMEKIT PAIRING to confirm.');
      await this.stopInternal();
      backupInstallation(this.dir);
      // HAP caches storage in-process. Require a new process before creating new credentials.
      rmSync(join(this.dir, 'hap-storage'), { recursive: true, force: true });
      if (existsSync(join(this.dir, 'identity.json')))
        rmSync(join(this.dir, 'identity.json'));
      this.restartRequired = true;
      this.logger.log('info', 'pairing_reset_requires_restart');
    });
  }
  autostart(enable: boolean): void {
    setStartup(this.dir, enable);
  }
}
