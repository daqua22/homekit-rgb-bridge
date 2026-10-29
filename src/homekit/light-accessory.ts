import {
  Accessory,
  Characteristic,
  HAPStatus,
  HapStatusError,
  Service,
  uuid,
  type CharacteristicValue,
} from '@homebridge/hap-nodejs';
import type { DeviceManager } from '../devices/device-manager.js';
import type { LightState } from '../devices/device-types.js';
export function accessoryID(id: string): string {
  return uuid.generate('homekit-rgb-bridge:' + id);
}
export function createLight(
  id: string,
  name: string,
  manager: DeviceManager,
): Accessory {
  const accessory = new Accessory(name, accessoryID(id));
  accessory
    .getService(Service.AccessoryInformation)!
    .setCharacteristic(Characteristic.Manufacturer, 'HomeKit RGB Bridge')
    .setCharacteristic(Characteristic.Model, 'RGB Light')
    .setCharacteristic(Characteristic.SerialNumber, id);
  const light = accessory.addService(Service.Lightbulb, name);
  const entries = [
    ['on', Characteristic.On],
    ['brightness', Characteristic.Brightness],
    ['hue', Characteristic.Hue],
    ['saturation', Characteristic.Saturation],
  ] as const;
  for (const [key, type] of entries) {
    light
      .getCharacteristic(type)
      .onGet(() => {
        try {
          return manager.state(id)[key];
        } catch {
          throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
      })
      .onSet(async (value: CharacteristicValue) => {
        if (
          (key === 'on' && typeof value !== 'boolean') ||
          (key !== 'on' && typeof value !== 'number')
        )
          throw new HapStatusError(HAPStatus.INVALID_VALUE_IN_REQUEST);
        try {
          await manager.request(id, { [key]: value } as Partial<LightState>);
        } catch {
          throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
      });
  }
  manager.on('state', (changed: string, state: LightState) => {
    if (changed === id)
      for (const [key, type] of entries)
        light.updateCharacteristic(type, state[key]);
  });
  manager.on('availability', () => {
    for (const [key, type] of entries) {
      if (manager.isAvailable(id))
        light.updateCharacteristic(type, manager.store.get(id)[key]);
      else
        light.updateCharacteristic(
          type,
          new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE),
        );
    }
  });
  return accessory;
}
