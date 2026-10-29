export interface RGBColor {
  r: number;
  g: number;
  b: number;
}
export interface LightState {
  on: boolean;
  hue: number;
  saturation: number;
  brightness: number;
}
export interface RGBDevice {
  id: string;
  name: string;
  manufacturer: string;
  zones: {
    name: string;
    ledCount: number;
    id?: string;
    offset?: number;
    controllable?: boolean;
    reason?: string;
  }[];
  capabilities: {
    color: boolean;
    brightness: 'software' | 'none';
    power: 'software' | 'none';
    independentZones: boolean;
    reason?: string;
  };
}
export const defaultState: LightState = {
  on: false,
  hue: 0,
  saturation: 0,
  brightness: 100,
};
