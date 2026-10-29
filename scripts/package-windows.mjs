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
    'Build this package on Windows x64; validate it there before distribution.',
  );
const runtime = JSON.parse(readFileSync('distribution-runtime.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const name = `homekit-rgb-bridge-${pkg.version}-windows-x64-portable`;
const stage = mkdtempSync(join(tmpdir(), 'rgb-portable-'));
function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (r.status !== 0) throw new Error(`Packaging command failed: ${cmd}`);
}
try {
  const root = join(stage, name);
  mkdirSync(root);
  mkdirSync(join(root, 'runtime'));
  const response = await fetch(runtime.url, {
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error('Official Node runtime download failed');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== runtime.sha256)
    throw new Error('Node runtime checksum mismatch');
  const archive = join(stage, 'node.zip');
  writeFileSync(archive, bytes);
  run('tar', ['-xf', archive, '-C', stage]);
  const node = join(stage, `node-v${runtime.version}-win-x64`);
  cpSync(join(node, 'node.exe'), join(root, 'runtime', 'node.exe'));
  cpSync(join(node, 'LICENSE'), join(root, 'runtime', 'LICENSE.txt'));
  cpSync('distribution-runtime.json', join(root, 'runtime', 'provenance.json'));
  for (const path of [
    'dist',
    'public',
    'docs',
    'LICENSE',
    'README.md',
    'SECURITY.md',
    'THIRD_PARTY_NOTICES.md',
    'package.json',
    'package-lock.json',
    'Launch-Bridge.vbs',
    'CHANGELOG.md',
  ])
    cpSync(path, join(root, path), { recursive: true });
  run('cmd.exe', ['/d', '/c', 'npm ci --omit=dev --ignore-scripts'], {
    cwd: root,
  });
  writeFileSync(
    join(root, 'Portable-CLI.cmd'),
    '@echo off\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node.exe" "%~dp0dist\\index.js" %*\r\n',
  );
  mkdirSync('artifacts', { recursive: true });
  const target = resolve('artifacts', name + '.zip');
  run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Compress-Archive -LiteralPath $env:RGB_PACKAGE_ROOT -DestinationPath $env:RGB_PACKAGE_OUT -Force',
    ],
    {
      env: { ...process.env, RGB_PACKAGE_ROOT: root, RGB_PACKAGE_OUT: target },
    },
  );
  writeFileSync(
    'artifacts/SHA256SUMS-windows-x64.txt',
    createHash('sha256').update(readFileSync(target)).digest('hex') +
      '  ' +
      name +
      '.zip\n',
  );
  console.log(
    'Built portable Windows x64 package with checksum-pinned Node runtime, runtime dependencies, local control panel and background launcher.',
  );
} finally {
  rmSync(stage, { recursive: true, force: true });
}
