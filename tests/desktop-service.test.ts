import { expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { startDesktopService } from '../src/desktop/service.js';
it('starts the official Node sidecar without inherited Electron-only runtime flags', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rgb-runtime-flags-')),
    entry = join(dir, 'service.cjs');
  writeFileSync(
    entry,
    `const {createServer}=require('node:http');let server;process.on('message',m=>{if(m.type==='initialize'){server=createServer((_r,s)=>s.end('{"ok":true}'));server.listen(0,'127.0.0.1',()=>process.send({type:'ready',origin:'http://127.0.0.1:'+server.address().port,token:'${randomBytes(32).toString('hex')}'}));}else if(m.type==='shutdown'){server.close(()=>process.disconnect());}});`,
  );
  const original = process.execArgv;
  let service: Awaited<ReturnType<typeof startDesktopService>> | undefined;
  try {
    process.execArgv = [...original, '--electron-only-invalid-node-flag'];
    service = await startDesktopService({
      entry,
      node: process.execPath,
      profile: dir,
      autostart: false,
      setAutostart: () => {},
    });
    expect(await service.api('status')).toEqual({ ok: true });
  } finally {
    process.execArgv = original;
    await service?.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
