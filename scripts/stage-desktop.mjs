import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
if (process.platform !== 'win32' || process.arch !== 'x64')
  throw new Error(
    'Build and validate the Windows desktop installer on Windows x64.',
  );
const runtime = JSON.parse(readFileSync('distribution-runtime.json', 'utf8'));
const stage = resolve('artifacts/desktop-support');
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, 'bridge'), { recursive: true });
mkdirSync(join(stage, 'runtime'));
for (const path of [
  'dist',
  'public',
  'package.json',
  'package-lock.json',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
])
  cpSync(path, join(stage, 'bridge', path), { recursive: true });
const install = spawnSync(
  process.execPath,
  [process.env.npm_execpath, 'ci', '--omit=dev', '--ignore-scripts'],
  { cwd: join(stage, 'bridge'), stdio: 'inherit' },
);
if (install.status !== 0)
  throw new Error('Desktop bridge dependency installation failed');
const temp = mkdtempSync(join(tmpdir(), 'rgb-desktop-node-'));
try {
  const response = await fetch(runtime.url, {
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error('Official Node runtime download failed');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== runtime.sha256)
    throw new Error('Official Node runtime checksum mismatch');
  const file = join(temp, 'node.zip');
  writeFileSync(file, bytes);
  if (
    spawnSync('tar', ['-xf', file, '-C', temp], { stdio: 'inherit' }).status !==
    0
  )
    throw new Error('Runtime extraction failed');
  const source = join(temp, `node-v${runtime.version}-win-x64`);
  cpSync(join(source, 'node.exe'), join(stage, 'runtime', 'node.exe'));
  cpSync(join(source, 'LICENSE'), join(stage, 'runtime', 'LICENSE.txt'));
  cpSync(
    'distribution-runtime.json',
    join(stage, 'runtime', 'provenance.json'),
  );
  if (
    spawnSync(
      join(stage, 'runtime', 'node.exe'),
      [
        '-e',
        "if (!require('node:crypto').getCiphers().includes('chacha20-poly1305')) process.exit(1)",
      ],
      { stdio: 'inherit' },
    ).status !== 0
  )
    throw new Error('Bundled runtime lacks required HomeKit cipher');
  console.log(
    'Desktop backend staged with pinned official Node, HAP-compatible crypto and locked production dependencies.',
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
