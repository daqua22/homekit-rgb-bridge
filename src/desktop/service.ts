import { fork } from 'node:child_process';
import { z } from 'zod';
import { setTimeout as delay } from 'node:timers/promises';
import { basename } from 'node:path';
export async function startDesktopService(options: {
  entry: string;
  node: string;
  profile: string;
  autostart: boolean;
  setAutostart(enabled: boolean): void;
  diagnostic?(event: string): void;
}) {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.DEBUG;
  delete env.ELECTRON_RUN_AS_NODE;
  const child = fork(options.entry, ['--data-dir', options.profile], {
    execPath: options.node,
    // Electron/automation flags are not valid arguments for the official Node sidecar.
    execArgv: [],
    env,
    silent: true,
    windowsHide: true,
  });
  // Child diagnostics stay in its bounded private event log, never argv or desktop console.
  child.stdout?.resume();
  child.stderr?.on('data', (bytes: Buffer) => {
    const text = bytes.toString('utf8');
    if (/bad option:|not allowed in NODE_OPTIONS/.test(text))
      options.diagnostic?.('desktop_node_invalid_option');
    else if (/MODULE_NOT_FOUND|Cannot find (module|package)/.test(text)) {
      options.diagnostic?.('desktop_node_missing_module');
      const missing = text.match(
        /Cannot find (?:module|package) ['"]([^'"]+)['"]/,
      );
      if (missing) {
        const name = basename(missing[1]!.replaceAll('\\', '/'));
        const known: Record<string, string> = {
          'bridge.js': 'desktop_node_missing_entry',
          'loader.js': 'desktop_node_missing_loader',
          zod: 'desktop_node_missing_zod',
          'proper-lockfile': 'desktop_node_missing_lockfile',
          'hap-nodejs': 'desktop_node_missing_hap',
        };
        options.diagnostic?.(
          known[name] ?? 'desktop_node_missing_other_dependency',
        );
      }
    } else if (/chacha20-poly1305/.test(text))
      options.diagnostic?.('desktop_node_crypto_unavailable');
    else if (/ERR_|Error:/.test(text))
      options.diagnostic?.('desktop_node_startup_error');
  });
  let exitCode: number | null = null;
  child.once('exit', (code) => {
    exitCode = code ?? 1;
  });
  child.on('message', (value: unknown) => {
    const request = z
      .strictObject({
        type: z.literal('startup-request'),
        id: z.number().int(),
        enabled: z.boolean(),
      })
      .safeParse(value);
    if (!request.success) return;
    try {
      options.setAutostart(request.data.enabled);
      if (child.connected)
        child.send({
          type: 'startup-result',
          id: request.data.id,
          ok: true,
          enabled: request.data.enabled,
        });
    } catch {
      if (child.connected)
        child.send({ type: 'startup-result', id: request.data.id, ok: false });
    }
  });
  const session = await new Promise<{ origin: string; token: string }>(
    (resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Bridge startup timed out'));
      }, 45000);
      const fail = () => {
        clearTimeout(timer);
        reject(new Error('Bridge startup failed'));
      };
      child.once('error', fail);
      child.once('exit', fail);
      child.on('message', (value: unknown) => {
        const ready = z
          .strictObject({
            type: z.literal('ready'),
            origin: z.string().regex(/^http:\/\/127\.0\.0\.1:\d+$/),
            token: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .safeParse(value);
        if (ready.success) {
          clearTimeout(timer);
          resolve(ready.data);
          return;
        }
        if (
          value &&
          typeof value === 'object' &&
          'type' in value &&
          value.type === 'profile-running'
        ) {
          clearTimeout(timer);
          reject(new Error('PROFILE_ALREADY_RUNNING'));
        }
      });
      child.once('spawn', () => {
        options.diagnostic?.('desktop_node_spawned');
        child.send({ type: 'initialize', enabled: options.autostart });
      });
    },
  );
  async function api(path: string, value?: unknown) {
    const response = await fetch(session.origin + '/api/' + path, {
      method: value === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: 'Bearer ' + session.token,
        ...(value === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: value === undefined ? undefined : JSON.stringify(value),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('Bridge request failed');
    return response.json();
  }
  let stopping: Promise<void> | undefined;
  return {
    ...session,
    api,
    child,
    stop: () =>
      (stopping ??= (async () => {
        if (exitCode !== null) return;
        if (child.connected) child.send({ type: 'shutdown' });
        await Promise.race([
          new Promise((r) => child.once('exit', r)),
          delay(15000),
        ]);
        if (exitCode === null) {
          child.kill();
          await Promise.race([
            new Promise((r) => child.once('exit', r)),
            delay(2000),
          ]);
        }
      })()),
  };
}
