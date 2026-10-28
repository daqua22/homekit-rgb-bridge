import type { LightState, RGBColor } from '../devices/device-types.js';
export function range(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error('Value out of range');
  return value;
}
export function validateRGB(rgb: RGBColor): void {
  for (const c of [rgb.r, rgb.g, rgb.b]) {
    range(c, 0, 255);
    if (!Number.isInteger(c)) throw new Error('RGB channels must be integers');
  }
}
export function hsvToRGB(h: number, s: number, v: number): RGBColor {
  range(h, 0, 360);
  range(s, 0, 100);
  range(v, 0, 100);
  const c = (v / 100) * (s / 100);
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v / 100 - c;
  const sectors = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r = 0, g = 0, b = 0] = sectors[Math.floor((h % 360) / 60)]!;
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}
export function rgbToHSV(rgb: RGBColor): {
  hue: number;
  saturation: number;
  brightness: number;
} {
  validateRGB(rgb);
  const r = rgb.r / 255,
    g = rgb.g / 255,
    b = rgb.b / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  let h = 0;
  if (d)
    h =
      max === r
        ? ((g - b) / d) % 6
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
  return {
    hue: (h * 60 + 360) % 360,
    saturation: max === 0 ? 0 : (d / max) * 100,
    brightness: max * 100,
  };
}
export function stateToRGB(state: LightState): RGBColor {
  return hsvToRGB(state.hue, state.saturation, state.on ? state.brightness : 0);
}
