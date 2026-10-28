import {
  Bridge,
  Categories,
  Characteristic,
  HAPStorage,
  MDNSAdvertiser,
  Service,
  uuid,
} from '@homebridge/hap-nodejs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import qr from 'qrcode-terminal';
import type { Config } from '../config/config-manager.js';
import { ensurePrivateDirectory } from '../config/config-manager.js';
import type { Identity } from '../config/identity.js';
import type { DeviceManager } from '../devices/device-manager.js';
import { createLight } from './light-accessory.js';
export class AccessoryManager {
  readonly bridge: Bridge;
  constructor(
    private config: Config,
    private identity: Identity,
    manager: DeviceManager,
    dir: string,
  ) {
    const storage = join(dir, 'hap-storage');
    ensurePrivateDirectory(storage);
    HAPStorage.setCustomStoragePath(storage);
    this.bridge = new Bridge(
      config.homekit.name,
      uuid.generate('homekit-rgb-bridge:' + identity.username),
    );
    this.bridge
      .getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Daniil Kozar')
      .setCharacteristic(Characteristic.Model, 'HomeKit RGB Bridge')
      .setCharacteristic(
        Characteristic.SerialNumber,
        identity.username.replaceAll(':', ''),
      )
      .setCharacteristic(Characteristic.FirmwareRevision, '0.1.0-dev.0');
    for (const d of config.devices.filter((d) => d.enabled))
      this.bridge.addBridgedAccessory(createLight(d.id, d.name, manager));
  }
  async start(showPairing = false): Promise<void> {
    // HAP-NodeJS emits listener errors asynchronously. Check ordinary port conflicts first.
    await new Promise<void>((resolve, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(this.config.homekit.port, () =>
        probe.close((error) => (error ? reject(error) : resolve())),
      );
    });
    let advertised = false;
    const markAdvertised = () => {
      advertised = true;
    };
    this.bridge.once('advertised', markAdvertised);
    await this.bridge.publish({
      username: this.identity.username,
      pincode: this.identity.pincode,
      setupID: this.identity.setupID,
      category: Categories.BRIDGE,
      port: this.config.homekit.port,
      advertiser: MDNSAdvertiser.CIAO,
      ...(this.config.homekit.bind ? { bind: this.config.homekit.bind } : {}),
    });
    const deadline = Date.now() + 15000;
    while (!advertised && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 50));
    this.bridge.removeListener('advertised', markAdvertised);
    if (!advertised) throw new Error('HomeKit advertisement timed out');
    if (showPairing) {
      console.log(
        'Private setup credentials. Do not share or record this terminal.',
      );
      console.log(`HomeKit setup code: ${this.identity.pincode}`);
      qr.generate(this.bridge.setupURI(), { small: true });
    }
  }
  async stop(): Promise<void> {
    await this.bridge.unpublish();
  }
}
