import { it, expect, afterEach } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig, loadConfig } from '../src/config/config-manager.js';
import { loadIdentity } from '../src/config/identity.js';
import { StateStore } from '../src/config/state-store.js';
import { accessoryID } from '../src/homekit/light-accessory.js';
const paths: string[] = [];
afterEach(() => {
  for (const p of paths.splice(0)) rmSync(p, { recursive: true, force: true });
});
it('reads a legacy installation without modifying config, state, identity or HAP files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rgb-legacy-'));
  paths.push(dir);
  const config = {
    ...defaultConfig(true),
    homekit: { name: 'Existing RGB Bridge', port: 51827 },
  };
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config));
  const identity = loadIdentity(dir);
  new StateStore(dir).set('mock:virtual-light', {
    on: true,
    hue: 240,
    saturation: 100,
    brightness: 42,
  });
  mkdirSync(join(dir, 'hap-storage'));
  writeFileSync(join(dir, 'hap-storage', 'sentinel'), 'existing pairing data');
  const before = [
    'config.json',
    'identity.json',
    'state.json',
    'hap-storage/sentinel',
  ].map((p) => readFileSync(join(dir, p), 'utf8'));
  expect(loadConfig(dir).homekit.port).toBe(51827);
  expect(loadIdentity(dir)).toEqual(identity);
  expect(new StateStore(dir).get('mock:virtual-light').brightness).toBe(42);
  expect(accessoryID('mock:virtual-light')).toBe(
    'e9d84024-f02a-4457-bd4e-f1317cee9af7',
  );
  expect(
    ['config.json', 'identity.json', 'state.json', 'hap-storage/sentinel'].map(
      (p) => readFileSync(join(dir, p), 'utf8'),
    ),
  ).toEqual(before);
});
it('refuses to generate replacement credentials over orphaned HAP storage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rgb-orphan-'));
  paths.push(dir);
  mkdirSync(join(dir, 'hap-storage'));
  writeFileSync(join(dir, 'hap-storage', 'old'), 'existing keys');
  expect(() => loadIdentity(dir)).toThrow('original identity');
});
