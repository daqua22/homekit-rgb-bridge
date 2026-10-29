import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import {
  acquireLock,
  ensurePrivateDirectory,
  initialize,
  readJSON,
  writeJSON,
} from '../config/config-manager.js';
import { configuredLights } from '../devices/device-manager.js';
import { AppController } from './controller.js';
import { startAdmin } from './server.js';
export function openPanel(dir: string): void {
  const file = join(dir, 'open-control.html');
  const command =
    process.platform === 'win32'
      ? 'explorer.exe'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open';
  execFile(command, [file], (error) => {
    if (error)
      console.error(
        'Control panel could not open. Open the private open-control.html file in your data folder.',
      );
  });
}
export async function runApp(
  dir: string,
  open = false,
  port?: number,
): Promise<void> {
  ensurePrivateDirectory(dir);
  // A second launcher may safely reopen the existing authenticated panel; credentials never enter argv.
  if (existsSync(join(dir, 'admin-session.json'))) {
    try {
      const session = readJSON(join(dir, 'admin-session.json')) as {
        origin: string;
        token: string;
      };
      if (
        /^http:\/\/127\.0\.0\.1:\d+$/.test(session.origin) &&
        /^[a-f0-9]{64}$/.test(session.token)
      ) {
        const response = await fetch(session.origin + '/api/status', {
          headers: { Authorization: 'Bearer ' + session.token },
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          if (open) openPanel(dir);
          return;
        }
      }
    } catch {
      /* A crashed instance can leave a stale local session file. */
    }
  }
  let release: (() => void) | undefined;
  for (let attempt = 0; attempt < 7; attempt++) {
    try {
      release = acquireLock(dir);
      break;
    } catch (error) {
      if (attempt === 6) throw error;
      await delay(2000);
    }
  }
  if (!release) throw new Error('Data folder is locked');
  if (!existsSync(join(dir, 'config.json'))) initialize(dir, false);
  const controller = new AppController(dir);
  let admin: Awaited<ReturnType<typeof startAdmin>> | undefined;
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await controller.stop();
    } finally {
      try {
        await admin?.close();
      } finally {
        for (const f of ['admin-session.json', 'open-control.html'])
          rmSync(join(dir, f), { force: true });
        release?.();
      }
    }
  };
  try {
    try {
      admin = await startAdmin(controller, { port, onQuit: stop });
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== 'EADDRINUSE' ||
        port !== undefined
      )
        throw error;
      admin = await startAdmin(controller, { port: 0, onQuit: stop });
    }
    writeJSON(join(dir, 'admin-session.json'), {
      origin: admin.origin,
      token: admin.token,
      pid: process.pid,
    });
    const url = admin.origin + '/#token=' + admin.token;
    writeFileSync(
      join(dir, 'open-control.html'),
      `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url=${url}"><title>Open HomeKit RGB Bridge</title><a href="${url}">Open local control panel</a>`,
      { mode: 0o600 },
    );
    process.once('SIGINT', () => {
      void stop().catch(() => {
        process.exitCode = 1;
      });
    });
    process.once('SIGTERM', () => {
      void stop().catch(() => {
        process.exitCode = 1;
      });
    });
    if (configuredLights(controller.config).length)
      try {
        await controller.start();
      } catch {
        /* Preserve the admin interface so the user can fix configuration. */
      }
    controller.logger.log('info', 'control_panel_ready');
    if (open) openPanel(dir);
  } catch (error) {
    await stop();
    throw error;
  }
}
