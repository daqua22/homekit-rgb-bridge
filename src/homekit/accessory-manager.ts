import { VERSION } from '../version.js';
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
import {
  configuredLights,
  type DeviceManager,
} from '../devices/device-manager.js';
import { createLight } from './light-accessory.js';
let storagePath: string | undefined;
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
    if (!storagePath) {
      HAPStorage.setCustomStoragePath(storage);
      storagePath = storage;
    } else if (storagePath !== storage)
      throw new Error('One HAP data directory per process is required');
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
      .setCharacteristic(Characteristic.FirmwareRevision, VERSION);
    for (const d of configuredLights(config))
      this.bridge.addBridgedAccessory(createLight(d.id, d.name, manager));
  }
  async start(showPairing = false): Promise<void> {
    // HAP-NodeJS emits listener errors asynchronously. Check ordinary port conflicts first.
    await new Promise<void>((resolve, reject) => {
      const probe = createServer((socket) => socket.destroy());
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
  paired(): boolean {
    return this.bridge._accessoryInfo?.paired() ?? false;
  }
  pairing(): { pincode: string; uri: string } {
    return { pincode: this.identity.pincode, uri: this.bridge.setupURI() };
  }
  async stop(): Promise<void> {
    await this.bridge.unpublish();
  }
}
