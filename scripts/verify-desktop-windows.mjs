import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { listPackage } from '@electron/asar';
if (process.platform !== 'win32' || process.arch !== 'x64')
  throw new Error('Verify this installer on Windows x64.');
const output = resolve('artifacts/desktop');
const [expected, name] = readFileSync(
  join(output, 'SHA256SUMS-desktop.txt'),
  'utf8',
)
  .trim()
  .split(/\s+/);
const installer = join(output, name),
  bytes = readFileSync(installer);
if (
  createHash('sha256').update(bytes).digest('hex') !== expected ||
  bytes.subarray(0, 2).toString() !== 'MZ'
)
  throw new Error('Installer checksum/PE validation failed');
const unpacked = join(output, 'win-unpacked');
const entries = listPackage(join(unpacked, 'resources', 'app.asar'));
if (
  entries.some((n) =>
    /(^|\/)(identity\.json|state\.json|admin-session\.json|open-control\.html|events\.log|config\.json|\.env|hap-storage|backups)(\/|$)/.test(
      n,
    ),
  )
)
  throw new Error('Private profile data in desktop archive');
for (const path of [
  'resources/runtime/node.exe',
  'resources/runtime/LICENSE.txt',
  'resources/runtime/provenance.json',
  'resources/bridge/dist/desktop/bridge.js',
  'resources/bridge/public/desktop.html',
  'LICENSE.electron.txt',
  'LICENSES.chromium.html',
  'LICENSE.bridge.txt',
  'THIRD_PARTY_NOTICES.md',
]) {
  if (!existsSync(join(unpacked, path)))
    throw new Error('Missing desktop distribution component: ' + path);
}
const root = mkdtempSync(join(tmpdir(), 'rgb-installer-'));
const destination = join(root, 'App');
const sentinel = join(root, 'existing-profile-sentinel.json');
writeFileSync(sentinel, '{"synthetic":"retained outside installation"}');
let installed = false;
try {
  const result = spawnSync(installer, ['/S', '/D=' + destination], {
    windowsHide: true,
    timeout: 180000,
  });
  if (
    result.status !== 0 ||
    !existsSync(join(destination, 'HomeKit RGB Bridge.exe'))
  )
    throw new Error('Silent per-user installer smoke failed');
  installed = true;
  const test = spawnSync(
    process.execPath,
    [process.env.npm_execpath, 'run', 'test:desktop'],
    {
      env: {
        ...process.env,
        BRIDGE_DESKTOP_EXE: join(destination, 'HomeKit RGB Bridge.exe'),
      },
      stdio: 'inherit',
      timeout: 240000,
    },
  );
  if (test.status !== 0)
    throw new Error('Installed application end-to-end verification failed');
  const remove = spawnSync(
    join(destination, 'Uninstall HomeKit RGB Bridge.exe'),
    ['/S'],
    { windowsHide: true, timeout: 180000 },
  );
  if (remove.status !== 0) throw new Error('Uninstaller smoke failed');
  installed = false;
  if (
    readFileSync(sentinel, 'utf8') !==
    '{"synthetic":"retained outside installation"}'
  )
    throw new Error('External profile sentinel was changed');
  console.log(
    'Installer checksum, notices, installed application, real synthetic SDK → HAP flow, renderer isolation, startup registry and uninstall verified. Physical hardware/reboot are separate checks.',
  );
} finally {
  if (
    installed &&
    existsSync(join(destination, 'Uninstall HomeKit RGB Bridge.exe'))
  )
    spawnSync(join(destination, 'Uninstall HomeKit RGB Bridge.exe'), ['/S'], {
      windowsHide: true,
      timeout: 180000,
    });
  // NSIS may finish deleting its temporary uninstaller after its parent exits.
  for (let i = 0; i < 20; i++) {
    try {
      rmSync(root, { recursive: true, force: true });
      break;
    } catch (error) {
      if (i === 19) {
        console.error(
          'Temporary installer files could not be removed:',
          error.code,
        );
        process.exitCode = 1;
      }
      await delay(500);
    }
  }
}
