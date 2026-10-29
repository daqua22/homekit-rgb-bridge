import { z } from 'zod';
import lockfile from 'proper-lockfile';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  renameSync,
  writeFileSync,
  unlinkSync,
  cpSync,
  readdirSync,
} from 'node:fs';
const name = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 '-]*[A-Za-z0-9]$|^[A-Za-z0-9]$/);
export const targetID = z
  .string()
  .regex(/^(mock:[a-z0-9-]+|openrgb:[a-f0-9]{24})(:zone:[a-f0-9]{16})?$/);
export const configSchema = z
  .strictObject({
    version: z.literal(1).default(1),
    groups: z
      .array(
        z.strictObject({
          id: z.string().regex(/^group:[a-zA-Z0-9-]{1,64}$/),
          name,
          enabled: z.boolean(),
          members: z.array(targetID).min(1).max(100),
        }),
      )
      .max(100)
      .default([]),
    experimentalZones: z.boolean().default(false),
    admin: z
      .strictObject({ port: z.number().int().min(1024).max(65535) })
      .default({ port: 8787 }),
    adapter: z.enum(['mock', 'openrgb']),
    openrgb: z.strictObject({
      host: z.enum(['127.0.0.1', 'localhost', '::1']),
      port: z.number().int().min(1).max(65535),
      timeoutMs: z.number().int().min(100).max(30000),
    }),
    homekit: z.strictObject({
      name,
      port: z.number().int().min(1024).max(65535),
      bind: z.array(z.string().min(1).max(100)).max(16).optional(),
    }),
    devices: z
      .array(
        z.strictObject({
          id: targetID,
          name,
          enabled: z.boolean(),
        }),
      )
      .max(100),
    connection: z.strictObject({
      pollMs: z.number().int().min(1000).max(60000),
      initialRetryMs: z.number().int().min(100).max(60000),
      maxRetryMs: z.number().int().min(100).max(300000),
    }),
    logging: z.enum(['error', 'info', 'debug']),
  })
  .superRefine((c, ctx) => {
    if (c.connection.maxRetryMs < c.connection.initialRetryMs)
      ctx.addIssue({
        code: 'custom',
        message: 'Retry maximum below initial delay',
      });
    if (new Set(c.devices.map((d) => d.id)).size !== c.devices.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate device IDs' });
    const groups = c.groups.filter((g) => g.enabled);
    if (groups.length + c.devices.filter((d) => d.enabled).length > 100)
      ctx.addIssue({
        code: 'custom',
        message: 'Maximum 100 enabled HomeKit lights',
      });
    const used = [
      ...c.devices.filter((d) => d.enabled).map((d) => d.id),
      ...groups.flatMap((g) => g.members),
    ];
    const parents = used.map((id) => id.split(':zone:')[0]);
    if (
      new Set(c.groups.map((g) => g.id)).size !== c.groups.length ||
      new Set(used).size !== used.length
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Each target may belong to only one enabled light/group',
      });
    if (
      used.some((id, i) => id.includes(':zone:') && used.includes(parents[i]!))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Whole device and zones cannot be enabled together',
      });
    if (!c.experimentalZones && used.some((id) => id.includes(':zone:')))
      ctx.addIssue({
        code: 'custom',
        message: 'Experimental zone consent required',
      });
    if (
      c.admin.port === c.homekit.port ||
      c.openrgb.port === c.homekit.port ||
      c.admin.port === c.openrgb.port
    )
      ctx.addIssue({ code: 'custom', message: 'Listening ports must differ' });
    if (
      [
        ...c.devices.map((d) => d.id),
        ...c.groups.flatMap((g) => g.members),
      ].some((id) => !id.startsWith(c.adapter + ':'))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Device belongs to a different adapter',
      });
  });
export type Config = z.infer<typeof configSchema>;
export function defaultConfig(mock = false): Config {
  return {
    version: 1,
    groups: [],
    experimentalZones: false,
    admin: { port: 8787 },
    adapter: mock ? 'mock' : 'openrgb',
    openrgb: { host: '127.0.0.1', port: 6742, timeoutMs: 3000 },
    homekit: { name: 'HomeKit RGB Bridge', port: 51826 },
    devices: mock
      ? [{ id: 'mock:virtual-light', name: 'Virtual RGB Light', enabled: true }]
      : [],
    connection: { pollMs: 5000, initialRetryMs: 1000, maxRetryMs: 30000 },
    logging: 'info',
  };
}
export function dataDirectory(): string {
  return process.platform === 'win32'
    ? join(
        process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
        'HomeKitRGBBridge',
      )
    : join(homedir(), '.homekit-rgb-bridge');
}
export function ensurePrivateDirectory(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
}
export function writeJSON(path: string, value: unknown): void {
  writeFileSync(path + '.tmp', JSON.stringify(value, null, 2) + '\n', {
    mode: 0o600,
  });
  renameSync(path + '.tmp', path);
}
export function readJSON(path: string): unknown {
  if (statSync(path).size > 1024 * 1024)
    throw new Error('Local JSON file exceeds size limit');
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}
export function initialize(dir: string, mock: boolean): void {
  ensurePrivateDirectory(dir);
  const file = join(dir, 'config.json');
  if (existsSync(file)) throw new Error('Configuration already exists');
  writeJSON(file, defaultConfig(mock));
}
/** Legacy v0 is upgraded in memory only. Explicit UI save creates a backup first. */
export function loadConfig(dir: string): Config {
  return configSchema.parse(readJSON(join(dir, 'config.json')));
}
export function backupInstallation(dir: string): string {
  const root = join(dir, 'backups');
  ensurePrivateDirectory(root);
  const dest = join(
    root,
    new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID(),
  );
  ensurePrivateDirectory(dest);
  for (const file of [
    'config.json',
    'state.json',
    'identity.json',
    'hap-storage',
  ])
    if (existsSync(join(dir, file)))
      cpSync(join(dir, file), join(dest, file), { recursive: true });
  return dest;
}
export function saveConfig(dir: string, value: unknown): Config {
  const config = configSchema.parse(value);
  backupInstallation(dir);
  writeJSON(join(dir, 'config.json'), config);
  return config;
}
export function backupsCount(dir: string): number {
  return existsSync(join(dir, 'backups'))
    ? readdirSync(join(dir, 'backups')).length
    : 0;
}

export function acquireLock(
  dir: string,
  onCompromised: () => void = () => {
    console.error('Application lock lost; shutting down to protect state.');
    process.exit(1);
  },
): () => void {
  const legacy = join(dir, 'bridge.lock');
  if (existsSync(legacy)) {
    const pid = Number(readFileSync(legacy, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid <= 0)
      throw new Error('Legacy lock requires manual inspection');
    try {
      process.kill(pid, 0);
      throw new Error('An older bridge is running');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    // Older processes only create this file. New processes coordinate via the atomic directory lock below.
  }
  const release = lockfile.lockSync(dir, {
    lockfilePath: join(dir, 'application.lock'),
    stale: 10000,
    update: 2000,
    onCompromised,
  });
  try {
    writeFileSync(legacy, String(process.pid), { mode: 0o600 });
  } catch (error) {
    release();
    throw error;
  }
  let released = false;
  return () => {
    if (!released) {
      released = true;
      if (
        existsSync(legacy) &&
        readFileSync(legacy, 'utf8') === String(process.pid)
      )
        unlinkSync(legacy);
      release();
    }
  };
}
