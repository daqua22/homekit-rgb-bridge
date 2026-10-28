import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const [hash, name] = readFileSync('artifacts/SHA256SUMS.txt', 'utf8')
  .trim()
  .split(/\s+/);
const archive = resolve('artifacts', name);
if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== hash)
  throw new Error('Checksum mismatch');
const listing = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
if (listing.status !== 0) throw new Error('Unreadable package');
const files = listing.stdout.trim().split('\n');
if (
  files.some(
    (p) =>
      /node_modules|identity\.json|state\.json|bridge\.lock|hap-storage|(^|\/)\.git(\/|$)|(^|\/)config\.json|(^|\/)\.env/.test(
        p,
      ) ||
      p.includes('..') ||
      p.startsWith('/'),
  )
)
  throw new Error('Unsafe package contents');
for (const suffix of [
  '/dist/index.js',
  '/LICENSE',
  '/package-lock.json',
  '/THIRD_PARTY_NOTICES.md',
  '/Start-Bridge.cmd',
])
  if (!files.some((p) => p.endsWith(suffix)))
    throw new Error(`Missing ${suffix}`);
const temp = mkdtempSync(join(tmpdir(), 'rgb-unpack-'));
function run(command, args, cwd) {
  const r = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32' && command === 'npm',
  });
  if (r.status !== 0)
    throw new Error(`Package check failed: ${command} ${args[0]}\n${r.stderr}`);
  return r.stdout;
}
try {
  run('tar', ['-xzf', archive, '-C', temp], process.cwd());
  const root = join(temp, readdirSync(temp)[0]);
  run('npm', ['ci', '--omit=dev', '--ignore-scripts'], root);
  if (process.platform === 'win32')
    run('cmd.exe', ['/d', '/c', 'Start-Bridge.cmd --help'], root);
  const data = join(temp, 'private-data');
  run(process.execPath, ['dist/index.js', '--help'], root);
  run(
    process.execPath,
    ['dist/index.js', 'init', '--mock', '--data-dir', data],
    root,
  );
  run(process.execPath, ['dist/index.js', 'check', '--data-dir', data], root);
  const devices = JSON.parse(
    run(process.execPath, ['dist/index.js', 'list', '--data-dir', data], root),
  );
  if (devices[0]?.id !== 'mock:virtual-light')
    throw new Error('Packaged mock discovery failed');
  console.log(
    `Checksum, archive allowlist, clean runtime install and packaged CLI verified (${files.length} entries).`,
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
