import type { RGBAdapter } from './rgb-adapter.js';
import type { RGBColor, RGBDevice } from '../devices/device-types.js';
import { validateRGB } from '../utils/color.js';
export const virtualDevice: RGBDevice = {
  id: 'mock:virtual-light',
  name: 'Virtual RGB Light',
  manufacturer: 'HomeKit RGB Bridge',
  zones: [{ name: 'Virtual', ledCount: 1 }],
  capabilities: {
    color: true,
    brightness: 'software',
    power: 'software',
    independentZones: false,
  },
};
export class MockRGBAdapter implements RGBAdapter {
  connected = false;
  devices: RGBDevice[] = [structuredClone(virtualDevice)];
  colors = new Map<string, RGBColor>();
  async connect(): Promise<void> {
    this.connected = true;
  }
  async disconnect(): Promise<void> {
    this.connected = false;
  }
  isConnected(): boolean {
    return this.connected;
  }
  async discoverDevices(): Promise<RGBDevice[]> {
    if (!this.connected) throw new Error('Disconnected');
    return structuredClone(this.devices);
  }
  async setColor(id: string, color: RGBColor): Promise<void> {
    validateRGB(color);
    if (
      !this.connected ||
      !this.devices.some((d) => d.id === id && d.capabilities.color)
    )
      throw new Error('Device unavailable');
    this.colors.set(id, { ...color });
  }
}
