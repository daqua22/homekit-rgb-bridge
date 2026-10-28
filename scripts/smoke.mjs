import { setTimeout, clearTimeout } from 'node:timers';
import { spawn, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { setTimeout as wait } from 'node:timers/promises';
const dir = mkdtempSync(join(tmpdir(), 'rgb-smoke-'));
const reservation = createServer();
await new Promise((r) => reservation.listen(0, '127.0.0.1', r));
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
function cli(args) {
  const r = spawnSync(
    process.execPath,
    ['dist/index.js', ...args, '--data-dir', dir],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error('CLI smoke failed');
  return r.stdout;
}
async function status() {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path: '/accessories', timeout: 1000 },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy());
    req.end();
  });
}
let child;
try {
  cli(['init', '--mock']);
  const config = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
  config.homekit.port = port;
  config.homekit.bind = ['127.0.0.1'];
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config));
  for (let run = 0; run < 2; run++) {
    child = spawn(
      process.execPath,
      ['dist/index.js', 'start', '--data-dir', dir],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    let ready = false;
    for (let i = 0; i < 400; i++) {
      try {
        if (
          (await status()) === 470 &&
          output.includes('bridge_started_experimental')
        ) {
          ready = true;
          break;
        }
      } catch {
        /* Startup may not yet listen. */
      }
      if (child.exitCode !== null) break;
      await wait(50);
    }
    if (!ready)
      throw new Error(
        'HAP listener did not start with authenticated access required',
      );
    const identity = JSON.parse(
      readFileSync(join(dir, 'identity.json'), 'utf8'),
    );
    if (output.includes(identity.pincode) || output.includes('X-HM://'))
      throw new Error('Pairing credential leaked to default output');
    // SIGTERM on Windows terminates directly; graceful signal shutdown is checked on POSIX only.
    if (process.platform === 'win32') {
      child.kill();
      await new Promise((r) => child.once('exit', r));
      break;
    }
    const exited = new Promise((r) => child.once('exit', (code) => r(code)));
    child.kill('SIGTERM');
    let shutdownTimer;
    const code = await Promise.race([
      exited,
      new Promise((_, reject) => {
        shutdownTimer = setTimeout(
          () => reject(new Error('Shutdown timed out')),
          10000,
        );
      }),
    ]);
    clearTimeout(shutdownTimer);
    if (code !== 0) throw new Error('Unclean shutdown');
    child = undefined;
    if (
      !readdirSync(join(dir, 'hap-storage')).some((p) =>
        p.startsWith('AccessoryInfo.'),
      )
    )
      throw new Error('HAP storage not persisted');
  }
  console.log(
    'Real HAP listener: authenticated endpoint, private default output, persistent HAP storage and POSIX graceful restart verified. Apple Home pairing and Windows reboot remain manual.',
  );
} finally {
  child?.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
}
