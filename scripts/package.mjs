import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const name = `homekit-rgb-bridge-${pkg.version}-windows-node-preview`;
const stage = mkdtempSync(join(tmpdir(), 'rgb-package-'));
try {
  const root = join(stage, name);
  mkdirSync(root);
  for (const path of [
    'dist',
    'public',
    'docs',
    'examples',
    'LICENSE',
    'README.md',
    'SECURITY.md',
    'THIRD_PARTY_NOTICES.md',
    'package.json',
    'package-lock.json',
    'Start-Bridge.cmd',
  ])
    cpSync(path, join(root, path), { recursive: true });
  mkdirSync('artifacts', { recursive: true });
  const target = resolve('artifacts', name + '.tar.gz');
  const tar = spawnSync('tar', ['-czf', target, '-C', stage, name], {
    stdio: 'inherit',
  });
  if (tar.status !== 0) throw new Error('Packaging failed');
  writeFileSync(
    'artifacts/SHA256SUMS.txt',
    createHash('sha256').update(readFileSync(target)).digest('hex') +
      '  ' +
      name +
      '.tar.gz\n',
  );
  console.log(
    'Built Windows Node preview archive (requires separate Node.js and npm ci --omit=dev). No standalone executable or installer.',
  );
} finally {
  rmSync(stage, { recursive: true, force: true });
}
