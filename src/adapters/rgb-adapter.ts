import type { RGBColor, RGBDevice } from '../devices/device-types.js';
export interface RGBAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  discoverDevices(): Promise<RGBDevice[]>;
  /** Transport acceptance only; implementations must document physical readback limitations. */
  setColor(deviceId: string, color: RGBColor): Promise<void>;
  isConnected(): boolean;
}
