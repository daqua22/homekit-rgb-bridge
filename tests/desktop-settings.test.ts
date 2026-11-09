import { afterEach, expect, it } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { defaultConfig } from '../src/config/config-manager.js';
import { launcherScript, startupFile } from '../src/windows/startup.js';
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
it('discovers neighboring and current profiles without opening pairing keys or changing profile files', () => {
  const dir = temp(),
    profile = join(dir, 'HomeKitRGBBridge');
  const hardware = profile + '-Hardware',
    other = join(dir, 'Custom saved bridge');
  for (const path of [hardware, other, join(dir, 'Unrelated')]) {
    mkdirSync(path);
    writeFileSync(join(path, 'config.json'), JSON.stringify(defaultConfig()));
  }
  mkdirSync(join(hardware, 'hap-storage'));
  const privateMarker = 'synthetic-private-marker-not-for-renderer';
  writeFileSync(join(hardware, 'identity.json'), privateMarker);
  writeFileSync(
    join(hardware, 'hap-storage', 'AccessoryInfo.AABBCCDDEEFF.json'),
    privateMarker,
  );
  const configBytes = readFileSync(join(hardware, 'config.json'), 'utf8');
  const found = profileCandidates(profile, [other, hardware], '');
  expect(found).toHaveLength(2);
  expect(existsSync(profile)).toBe(false);
  expect(found.find((p) => p.path === hardware)).toMatchObject({
    name: 'HomeKitRGBBridge-Hardware',
    bridgeName: 'HomeKit RGB Bridge',
    adapter: 'openrgb',
    lights: 0,
    available: true,
    hasIdentity: true,
    hasHomeKitData: true,
  });
  expect(JSON.stringify(found)).not.toContain(privateMarker);
  expect(readFileSync(join(hardware, 'config.json'), 'utf8')).toBe(configBytes);
  expect(readFileSync(join(hardware, 'identity.json'), 'utf8')).toBe(
    privateMarker,
  );
  expect(
    readFileSync(
      join(hardware, 'hap-storage', 'AccessoryInfo.AABBCCDDEEFF.json'),
      'utf8',
    ),
  ).toBe(privateMarker);
});
it('reports invalid and incomplete profiles without inventing identities or pairing status', () => {
  const dir = temp(),
    profile = join(dir, 'HomeKitRGBBridge');
  const missing = profile + '-MissingIdentity',
    invalid = profile + '-Invalid';
  mkdirSync(join(missing, 'hap-storage'), { recursive: true });
  mkdirSync(invalid);
  writeFileSync(join(missing, 'config.json'), JSON.stringify(defaultConfig()));
  writeFileSync(
    join(missing, 'hap-storage', 'AccessoryInfo.AABBCCDDEEFF.json'),
    'synthetic private data',
  );
  writeFileSync(join(invalid, 'config.json'), 'invalid json');
  const found = profileCandidates(profile, [], '');
  expect(found.find((p) => p.path === missing)).toMatchObject({
    available: false,
    hasIdentity: false,
    hasHomeKitData: true,
  });
  expect(found.find((p) => p.path === missing)?.problem).toContain(
    'Restore the original identity',
  );
  expect(found.find((p) => p.path === invalid)).toMatchObject({
    available: false,
  });
  expect(found.find((p) => p.path === invalid)?.problem).toContain(
    'unreadable or unsupported',
  );
  expect(profileCandidates(join(dir, 'DoesNotExist'), [], '')).toEqual([]);
});
it('finds custom profiles through recognized UTF-16 legacy launchers and ignores foreign or mismatched files', () => {
  const dir = temp(),
    appData = join(dir, 'Roaming'),
    profile = join(dir, 'HomeKitRGBBridge');
  const custom = join(dir, 'elsewhere', 'My RGB profile'),
    foreign = join(dir, 'Foreign profile');
  for (const path of [custom, foreign]) {
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'config.json'), JSON.stringify(defaultConfig()));
  }
  const launcher = startupFile(custom, appData);
  mkdirSync(dirname(launcher), { recursive: true });
  const script = launcherScript(
    join(dir, 'node.exe'),
    join(dir, 'index.js'),
    custom,
    true,
  );
  writeFileSync(launcher, '\ufeff' + script, 'utf16le');
  // A matching header alone is insufficient: the filename must match the profile's hash.
  writeFileSync(
    join(dirname(launcher), 'HomeKitRGBBridge-000000000000.vbs'),
    launcherScript(join(dir, 'node.exe'), join(dir, 'index.js'), foreign),
  );
  writeFileSync(join(dirname(launcher), 'unrelated.vbs'), script);
  const found = profileCandidates(profile, [], appData);
  expect(found.map((p) => p.path)).toEqual([custom]);
  expect(readFileSync(launcher).subarray(0, 2)).toEqual(
    Buffer.from([0xff, 0xfe]),
  );
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
