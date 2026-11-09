import { expect, it } from 'vitest';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { getFileMatchers } from 'app-builder-lib/out/fileMatcher.js';
import type { Configuration } from 'app-builder-lib';
it('copies sidecar production dependencies through the actual Electron Builder resource filters', () => {
  const root = mkdtempSync(join(tmpdir(), 'rgb-desktop-resource-'));
  try {
    const source = join(root, 'artifacts', 'desktop-support', 'bridge');
    mkdirSync(join(source, 'node_modules', 'zod'), { recursive: true });
    writeFileSync(
      join(source, 'node_modules', 'zod', 'package.json'),
      '{"name":"synthetic-zod-marker"}',
    );
    writeFileSync(join(source, 'package.json'), '{"name":"synthetic-bridge"}');
    const resources = join(root, 'output', 'resources');
    const config = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
      .build as Configuration;
    const matchers = getFileMatchers(config, 'extraResources', resources, {
      defaultSrc: root,
      globalOutDir: join(root, 'output'),
      customBuildOptions: {},
      macroExpander: (p) => p,
    });
    for (const matcher of matchers ?? []) {
      if (!existsSync(matcher.from)) continue;
      if (matcher.isEmpty()) matcher.prependPattern('**/*');
      const filter = matcher.createFilter();
      cpSync(matcher.from, matcher.to, {
        recursive: true,
        filter: (file) => filter(file, statSync(file)),
      });
    }
    expect(
      existsSync(
        join(resources, 'bridge', 'node_modules', 'zod', 'package.json'),
      ),
    ).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
