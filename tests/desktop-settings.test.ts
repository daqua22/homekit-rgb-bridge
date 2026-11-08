import { afterEach, expect, it } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  desktopSettingsSchema,
  loadDesktopSettings,
  saveDesktopSettings,
  profileCandidates,
  openRGBArguments,
  trustedDesktopFrame,
  findOpenRGB,
} from '../src/desktop/settings.js';
const dirs: string[] = [];
function temp() {
  const dir = mkdtempSync(join(tmpdir(), 'rgb-desktop-settings-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
it('loads defaults without writing or replacing a profile and persists only desktop preferences', () => {
  const dir = temp(),
    profile = join(dir, 'profile');
  const settings = loadDesktopSettings(dir, profile);
  expect(settings).toEqual({
    version: 1,
    profile,
    launchOpenRGB: false,
    openRGBPath: '',
    setupComplete: false,
  });
  mkdirSync(profile);
  writeFileSync(join(profile, 'identity.json'), 'synthetic existing identity');
  saveDesktopSettings(dir, { ...settings, setupComplete: true });
  expect(loadDesktopSettings(dir, 'ignored').profile).toBe(profile);
  expect(readFileSync(join(profile, 'identity.json'), 'utf8')).toBe(
    'synthetic existing identity',
  );
  expect(() =>
    desktopSettingsSchema.parse({ ...settings, version: 2 }),
  ).toThrow();
  expect(() =>
    desktopSettingsSchema.parse({ ...settings, profile: 'relative' }),
  ).toThrow();
});
it('finds existing profile folders without creating profiles', () => {
  const dir = temp(),
    profile = join(dir, 'HomeKitRGBBridge');
  mkdirSync(profile + '-Hardware');
  writeFileSync(join(profile + '-Hardware', 'config.json'), '{}');
  expect(profileCandidates(profile)).toEqual([
    { name: 'HomeKitRGBBridge-Hardware', path: resolve(profile + '-Hardware') },
  ]);
});
it('launches only loopback SDK arguments and detects the known installed executable', () => {
  expect(openRGBArguments('127.0.0.1', 6742)).toEqual([
    '--server',
    '--server-host',
    '127.0.0.1',
    '--server-port',
    '6742',
    '--gui',
    '--startminimized',
  ]);
  for (const host of ['0.0.0.0', 'attacker.example', '127.0.0.1 && echo bad'])
    expect(() => openRGBArguments(host, 6742)).toThrow();
  for (const port of [0, 80, 65536, 3.1])
    expect(() => openRGBArguments('127.0.0.1', port)).toThrow();
  const dir = temp();
  mkdirSync(join(dir, 'OpenRGB'));
  writeFileSync(
    join(dir, 'OpenRGB', 'OpenRGB.exe'),
    'synthetic executable marker',
  );
  expect(findOpenRGB({ ProgramFiles: dir })).toBe(
    join(dir, 'OpenRGB', 'OpenRGB.exe'),
  );
});
it('restricts privileged desktop operations to its exact loopback document', () => {
  const origin = 'http://127.0.0.1:8787';
  expect(trustedDesktopFrame(origin + '/desktop', origin)).toBe(true);
  for (const url of [
    origin + '/',
    origin + '/desktop/fake',
    'https://attacker.example/desktop',
    'http://localhost:8787/desktop',
    'http://127.0.0.1:8788/desktop',
    'file:///desktop',
    'about:blank',
    'invalid',
  ])
    expect(trustedDesktopFrame(url, origin)).toBe(false);
});
