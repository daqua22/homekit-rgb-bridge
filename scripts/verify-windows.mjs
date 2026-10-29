import {
  readFileSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
if (process.platform !== 'win32')
  throw new Error('Windows package verification must run on Windows.');
const [hash, name] = readFileSync(
    'artifacts/SHA256SUMS-windows-x64.txt',
    'utf8',
  )
    .trim()
    .split(/\s+/),
  archive = resolve('artifacts', name);
if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== hash)
  throw new Error('Portable checksum mismatch');
function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...options });
  if (r.status !== 0)
    throw new Error(`Portable check failed: ${cmd}\n${r.stderr}`);
  return r.stdout;
}
const entries = run('tar', ['-tf', archive])
  .trim()
  .split(/\r?\n/)
  .map((p) => p.replaceAll('\\', '/'));
if (
  entries.some(
    (p) =>
      p.startsWith('/') ||
      p.includes('../') ||
      /(^|\/)(identity\.json|state\.json|admin-session\.json|open-control\.html|bridge\.lock|hap-storage|backups|\.git|\.env)(\/|$)/.test(
        p,
      ),
  )
)
  throw new Error('Private data or unsafe path in package');
const temp = mkdtempSync(join(tmpdir(), 'rgb-portable-check-'));
let child, session;
async function freePort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
async function waitSession(dir) {
  for (let i = 0; i < 400; i++) {
    if (existsSync(join(dir, 'admin-session.json'))) {
      try {
        const s = JSON.parse(
          readFileSync(join(dir, 'admin-session.json'), 'utf8'),
        );
        const r = await fetch(s.origin + '/api/status', {
          headers: { Authorization: 'Bearer ' + s.token },
          signal: AbortSignal.timeout(1000),
        });
        if (r.ok) return s;
      } catch {
        /* Listener starting. */
      }
    }
    await delay(50);
  }
  throw new Error('Packaged background application did not start');
}
async function api(path, body) {
  const r = await fetch(session.origin + '/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: 'Bearer ' + session.token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error('Packaged API failed: ' + path);
  return r.json();
}
try {
  run('tar', ['-xf', archive, '-C', temp]);
  const root = join(temp, readdirSync(temp)[0]),
    node = join(root, 'runtime', 'node.exe'),
    entry = join(root, 'dist', 'index.js'),
    data = join(temp, 'private-profile');
  const runtime = JSON.parse(
    readFileSync(join(root, 'runtime', 'provenance.json'), 'utf8'),
  );
  if (run(node, ['--version']).trim() !== 'v' + runtime.version)
    throw new Error('Wrong bundled runtime');
  run(node, [entry, 'init', '--mock', '--data-dir', data]);
  const configPath = join(data, 'config.json'),
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  config.homekit.port = await freePort();
  config.homekit.bind = ['127.0.0.1'];
  config.admin.port = await freePort();
  writeFileSync(configPath, JSON.stringify(config));
  // No npm or installed Node is used to run this extracted application.
  child = spawn(node, [entry, 'app', '--data-dir', data], {
    windowsHide: true,
    stdio: 'ignore',
  });
  session = await waitSession(data);
  for (let i = 0; i < 300; i++) {
    if ((await api('status')).running) break;
    await delay(50);
  }
  if (!(await api('status')).running)
    throw new Error('Packaged HAP bridge failed');
  const identity = readFileSync(join(data, 'identity.json'), 'utf8');
  await api('light', {
    id: 'mock:virtual-light',
    state: { on: true, hue: 240, saturation: 100, brightness: 50 },
  });
  await api('stop', {});
  await api('start', {});
  if (readFileSync(join(data, 'identity.json'), 'utf8') !== identity)
    throw new Error('Pairing identity changed');
  await api('quit', {});
  await new Promise((r) => child.once('exit', r));
  child = undefined;
  if (
    existsSync(join(data, 'bridge.lock')) ||
    existsSync(join(data, 'application.lock'))
  )
    throw new Error('API shutdown left a lock');
  const { launcherScript } = await import('../dist/windows/startup.js');
  const launcher = join(temp, 'test-startup.vbs');
  writeFileSync(launcher, launcherScript(node, entry, data));
  run('cscript.exe', ['//nologo', launcher]);
  session = await waitSession(data);
  await api('quit', {});
  for (let i = 0; i < 100 && existsSync(join(data, 'application.lock')); i++)
    await delay(50);
  if (existsSync(join(data, 'application.lock')))
    throw new Error('Background launcher did not quit cleanly');
  console.log(
    'Windows portable package verified: bundled runtime, private API, mock HAP startup, light commands, stop/start identity preservation, graceful quit, and hidden VBS startup launcher. Physical Windows sign-in/reboot remains manual.',
  );
} finally {
  if (session)
    try {
      await api('quit', {});
    } catch {
      /* May already have exited. */
    }
  child?.kill();
  rmSync(temp, { recursive: true, force: true });
}
