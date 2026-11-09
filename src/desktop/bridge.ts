// Runs in the bundled official Node runtime, never Electron/BoringSSL.
import { resolve } from 'node:path';
import { runApp } from '../app/run.js';
let runtime: Awaited<ReturnType<typeof runApp>>;
let loginEnabled = false;
let nextRequest = 0;
const pending = new Map<
  number,
  { resolve(): void; reject(error: Error): void; timer: NodeJS.Timeout }
>();
async function stop() {
  await runtime?.stop();
  if (process.connected) process.disconnect?.();
}
process.once('disconnect', () => {
  void stop();
});
process.on('message', (message: unknown) => {
  if (!message || typeof message !== 'object') return;
  const m = message as Record<string, unknown>;
  if (m.type === 'shutdown') {
    void stop();
    return;
  }
  if (m.type === 'startup-result' && typeof m.id === 'number') {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    if (m.ok === true) {
      loginEnabled = m.enabled === true;
      p.resolve();
    } else p.reject(new Error('Windows startup could not be updated.'));
  }
});
process.once('message', (message: unknown) => {
  const m = message as { type?: string; enabled?: boolean };
  if (m?.type !== 'initialize') {
    process.exitCode = 1;
    if (process.connected) process.disconnect?.();
    return;
  }
  loginEnabled = m.enabled === true;
  const i = process.argv.indexOf('--data-dir');
  if (i < 0 || !process.argv[i + 1]) {
    process.exitCode = 1;
    if (process.connected) process.disconnect?.();
    return;
  }
  void runApp(resolve(process.argv[i + 1]!), false, undefined, {
    desktop: true,
    onQuit: () => {
      if (process.connected) process.disconnect?.();
    },
    startup: {
      enabled: () => loginEnabled,
      set: (enabled) =>
        new Promise<void>((resolve, reject) => {
          const id = ++nextRequest;
          const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error('Windows startup request timed out.'));
          }, 5000);
          pending.set(id, { resolve, reject, timer });
          process.send?.({ type: 'startup-request', id, enabled });
        }),
    },
  })
    .then((r) => {
      runtime = r;
      if (!runtime) throw new Error('No bridge runtime');
      process.send?.({
        type: 'ready',
        origin: runtime.admin.origin,
        token: runtime.admin.token,
      });
    })
    .catch((error) => {
      process.send?.({
        type:
          error instanceof Error && error.message === 'PROFILE_ALREADY_RUNNING'
            ? 'profile-running'
            : 'startup-error',
      });
      process.exitCode = 1;
      if (process.connected) process.disconnect?.();
    });
});
