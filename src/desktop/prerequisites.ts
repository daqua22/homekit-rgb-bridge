import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { statSync } from 'node:fs';
import { basename, dirname, isAbsolute } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { openRGBArguments } from './settings.js';
import { runWindowsCommand, windowsTool } from './windows-tools.js';
import { runManagedOpenRGBTask } from './startup-task.js';

export type DriverStatus = 'installed' | 'missing' | 'unknown' | 'not-windows';
export type StartupPhase =
  'idle' | 'checking' | 'starting' | 'waiting' | 'ready' | 'attention';
export interface StartupState {
  phase: StartupPhase;
  message: string;
  ready: boolean;
  started: boolean;
}
export interface OpenRGBLaunch {
  path: string;
  host: string;
  port: number;
  administrator: boolean;
}
export function validOpenRGBExecutable(path: string): boolean {
  try {
    return (
      isAbsolute(path) &&
      basename(path).toLowerCase() === 'openrgb.exe' &&
      statSync(path).isFile()
    );
  } catch {
    return false;
  }
}
export async function pawnIODriverStatus(): Promise<DriverStatus> {
  if (process.platform !== 'win32') return 'not-windows';
  try {
    const result = await runWindowsCommand(windowsTool('sc.exe'), [
      'query',
      'PawnIO',
    ]);
    return result.code === 0
      ? 'installed'
      : result.code === 1060
        ? 'missing'
        : 'unknown';
  } catch {
    return 'unknown';
  }
}
export async function sdkListening(
  host: string,
  port: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const finish = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(700, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}
export async function openRGBRunning(): Promise<boolean> {
  const result = await runWindowsCommand(windowsTool('tasklist.exe'), [
    '/FI',
    'IMAGENAME eq OpenRGB.exe',
    '/FO',
    'CSV',
    '/NH',
  ]);
  if (result.code !== 0)
    throw Error(
      'Could not check existing OpenRGB processes. Open OpenRGB manually or try again.',
    );
  return /"OpenRGB\.exe","\d+"/i.test(result.stdout);
}
export async function launchOpenRGBProcess(
  options: OpenRGBLaunch,
): Promise<void> {
  if (process.platform !== 'win32' || !validOpenRGBExecutable(options.path))
    throw Error('Choose your installed OpenRGB.exe in Settings first.');
  if (options.administrator) {
    await runManagedOpenRGBTask(options);
    return;
  }
  const child = spawn(
    options.path,
    openRGBArguments(options.host, options.port),
    {
      cwd: dirname(options.path),
      shell: false,
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
    },
  );
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', () =>
      reject(
        Error(
          'Windows could not open OpenRGB. Check its installation and permissions.',
        ),
      ),
    );
  });
  child.unref();
}
interface StartupDependencies {
  listening(host: string, port: number): Promise<boolean>;
  running(): Promise<boolean>;
  launch(options: OpenRGBLaunch): Promise<void>;
  valid(path: string): boolean;
  pause(ms: number): Promise<unknown>;
  now(): number;
  platform: string;
  waitMs: number;
}
export class OpenRGBStartup {
  private state: StartupState = {
    phase: 'idle',
    message: 'Automatic OpenRGB startup has not run.',
    ready: false,
    started: false,
  };
  private flight?: Promise<StartupState>;
  private stopped = false;
  private readonly deps: StartupDependencies;
  constructor(overrides: Partial<StartupDependencies> = {}) {
    this.deps = {
      listening: sdkListening,
      running: openRGBRunning,
      launch: launchOpenRGBProcess,
      valid: validOpenRGBExecutable,
      pause: delay,
      now: Date.now,
      platform: process.platform,
      waitMs: 30000,
      ...overrides,
    };
  }
  snapshot(): StartupState {
    return { ...this.state };
  }
  cancel() {
    this.stopped = true;
  }
  private update(phase: StartupPhase, message: string) {
    this.state = { ...this.state, phase, message, ready: phase === 'ready' };
    return this.snapshot();
  }
  ensure(options: OpenRGBLaunch): Promise<StartupState> {
    if (this.flight) return this.flight;
    this.flight = this.start(options)
      .catch((error: unknown) =>
        this.update(
          'attention',
          error instanceof Error
            ? error.message
            : 'OpenRGB could not start. Check its settings.',
        ),
      )
      .finally(() => {
        this.flight = undefined;
      });
    return this.flight;
  }
  private async start(options: OpenRGBLaunch): Promise<StartupState> {
    if (this.stopped) return this.snapshot();
    openRGBArguments(options.host, options.port);
    this.state.started = false;
    this.update('checking', 'Checking the OpenRGB SDK connection…');
    if (await this.deps.listening(options.host, options.port))
      return this.update(
        'ready',
        'The SDK port is available. No additional OpenRGB copy was opened.',
      );
    if (this.stopped) return this.snapshot();
    if (this.deps.platform !== 'win32')
      throw Error(
        'Automatic OpenRGB launch is available on Windows. Open OpenRGB manually here.',
      );
    const running = await this.deps.running();
    if (this.stopped) return this.snapshot();
    if (!running) {
      if (!this.deps.valid(options.path))
        throw Error('Choose your installed OpenRGB.exe in Settings first.');
      this.update(
        'starting',
        options.administrator
          ? 'Approve the Windows administrator prompt for OpenRGB, if shown.'
          : 'Opening OpenRGB in the background…',
      );
      await this.deps.launch(options);
      this.state.started = true;
    }
    this.update(
      'waiting',
      running
        ? 'OpenRGB is already running. Waiting for its SDK Server…'
        : 'Waiting for OpenRGB hardware detection and its SDK Server…',
    );
    const deadline = this.deps.now() + this.deps.waitMs;
    while (!this.stopped && this.deps.now() < deadline) {
      if (await this.deps.listening(options.host, options.port))
        return this.update(
          'ready',
          'The OpenRGB SDK port is available. The bridge can connect.',
        );
      await this.deps.pause(500);
    }
    return this.update(
      'attention',
      running
        ? 'OpenRGB is running but its SDK Server is unavailable. Enable the SDK Server in that copy; no duplicate was opened.'
        : 'OpenRGB was opened but its SDK Server is not ready. Check OpenRGB, hardware access and the configured port, then try Open now.',
    );
  }
}
