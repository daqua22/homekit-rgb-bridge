// Recover from stale upstream download responses without mirrors or integrity bypasses.
// Cache keys in @electron/get ignore URL queries, so fresh requests seed normal vendor caches.
import { downloadArtifact } from '@electron/get';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
export async function prefetchDesktopTooling() {
  if (process.platform !== 'win32' || process.arch !== 'x64') return;
  const electron = require('electron/package.json');
  const builder = require('app-builder-lib/package.json');
  if (electron.version !== '45.2.3' || builder.version !== '26.18.0')
    throw new Error(
      'Review desktop download pins after changing tool versions.',
    );
  const electronSums = require(
    join(dirname(require.resolve('electron/package.json')), 'checksums.json'),
  );
  const tools = require('app-builder-lib/out/util/electronGet.js');
  const electronCache = tools.defaultElectronGetCacheRoot();
  const builderCache = tools.getCacheDirectory({ allowEnvVarOverride: true });
  await mkdir(electronCache, { recursive: true });
  // The builder supports this seeding contract and still verifies the requested ZIP hash.
  await writeFile(
    join(electronCache, 'SHASUMS256.txt-' + electron.version),
    Object.entries(electronSums)
      .map(([name, hash]) => hash + ' *' + name)
      .join('\n') + '\n',
  );
  const electronFile = `electron-v${electron.version}-win32-x64.zip`;
  const freshURL = (url) => async () =>
    url + '?ci_verified_download=' + Date.now();
  const requests = [
    downloadArtifact({
      version: electron.version,
      artifactName: 'electron',
      platform: 'win32',
      arch: 'x64',
      cacheRoot: electronCache,
      checksums: electronSums,
      mirrorOptions: {
        resolveAssetURL: freshURL(
          `https://github.com/electron/electron/releases/download/v${electron.version}/${electronFile}`,
        ),
      },
    }),
  ];
  // Same versions/checksums used by the locked builder's Windows and 7zip toolsets.
  const archives = [
    [
      'nsis-3.0.4.1',
      'nsis-3.0.4.1.7z',
      '9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa',
    ],
    [
      'nsis-resources-3.4.1',
      'nsis-resources-3.4.1.7z',
      '593a9a92ef958321293ac6a2ee61e64bf1bd543142a5bd6b3d310709cc924103',
    ],
    [
      '7zip@1.0.0',
      '7zip-win-x64.tar.gz',
      'be071f15bd6da2f78fe81c6ddef2009b0c4d8a51f36b780cb806c7e6df95e1b3',
    ],
    [
      'nsis@1.2.1',
      'nsis-bundle-3.12.tar.gz',
      '56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4',
    ],
  ];
  for (const [release, file, hash] of archives)
    requests.push(
      downloadArtifact({
        version: '9.9.9',
        artifactName: file,
        isGeneric: true,
        cacheRoot: join(builderCache, 'downloads'),
        checksums: { [file]: hash },
        mirrorOptions: {
          resolveAssetURL: freshURL(
            `https://github.com/electron-userland/electron-builder-binaries/releases/download/${release}/${file}`,
          ),
        },
      }),
    );
  const results = await Promise.allSettled(requests);
  for (const result of results)
    if (result.status === 'rejected') throw result.reason;
  console.log(
    'Official desktop downloads cached with the locked SHA-256 pins verified.',
  );
}
