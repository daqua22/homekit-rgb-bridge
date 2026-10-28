import { describe, it, expect } from 'vitest';
import { hsvToRGB, rgbToHSV, stateToRGB } from '../src/utils/color.js';
describe('color conversions', () => {
  it.each([
    [0, 100, 100, 255, 0, 0],
    [120, 100, 100, 0, 255, 0],
    [240, 100, 100, 0, 0, 255],
    [360, 100, 100, 255, 0, 0],
    [60, 100, 100, 255, 255, 0],
    [180, 100, 100, 0, 255, 255],
    [300, 100, 100, 255, 0, 255],
    [42, 0, 100, 255, 255, 255],
    [20, 100, 0, 0, 0, 0],
    [0, 0, 50, 128, 128, 128],
  ])('HSV %s %s %s', (h, s, v, r, g, b) =>
    expect(hsvToRGB(h, s, v)).toEqual({ r, g, b }),
  );
  it('round trips a color grid within one channel unit', () => {
    for (let r = 0; r <= 255; r += 17)
      for (let g = 0; g <= 255; g += 17)
        for (let b = 0; b <= 255; b += 17) {
          const hsv = rgbToHSV({ r, g, b });
          const out = hsvToRGB(hsv.hue, hsv.saturation, hsv.brightness);
          expect(out).toEqual({ r, g, b });
        }
  });
  it('handles black and grayscale', () => {
    expect(rgbToHSV({ r: 0, g: 0, b: 0 })).toEqual({
      hue: 0,
      saturation: 0,
      brightness: 0,
    });
    expect(rgbToHSV({ r: 128, g: 128, b: 128 }).saturation).toBe(0);
  });
  it.each([
    [-1, 0, 0],
    [361, 0, 0],
    [0, 101, 0],
    [0, 0, 101],
    [NaN, 0, 0],
    [0, Infinity, 0],
  ])('rejects HSV %s %s %s', (h, s, v) =>
    expect(() => hsvToRGB(h, s, v)).toThrow(),
  );
  it('rejects invalid RGB', () =>
    expect(() => rgbToHSV({ r: 0.5, g: 0, b: 0 })).toThrow());
  it('scales brightness and sends black without losing color', () => {
    const s = { on: true, hue: 0, saturation: 100, brightness: 50 };
    expect(stateToRGB(s)).toEqual({ r: 128, g: 0, b: 0 });
    expect(stateToRGB({ ...s, on: false })).toEqual({ r: 0, g: 0, b: 0 });
  });
});
