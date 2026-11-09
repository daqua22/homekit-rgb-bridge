import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const dir = 'artifacts/desktop';
const files = readdirSync(dir).filter((name) =>
  /^HomeKit-RGB-Bridge-.*-Setup-x64\.exe$/.test(name),
);
if (files.length !== 1)
  throw new Error(
    'Expected one Windows x64 installer; clear stale desktop output before rebuilding.',
  );
writeFileSync(
  join(dir, 'SHA256SUMS-desktop.txt'),
  files
    .map(
      (name) =>
        createHash('sha256')
          .update(readFileSync(join(dir, name)))
          .digest('hex') +
        '  ' +
        name,
    )
    .join('\n') + '\n',
);
console.log('Generated desktop installer SHA-256 checksum.');
