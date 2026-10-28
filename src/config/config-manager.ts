import { z } from 'zod';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  renameSync,
  writeFileSync,
  openSync,
  closeSync,
  unlinkSync,
} from 'node:fs';
const name = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 '-]*[A-Za-z0-9]$|^[A-Za-z0-9]$/);
export const configSchema = z
  .strictObject({
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
          id: z.string().regex(/^(mock:[a-z0-9-]+|openrgb:[a-f0-9]{24})$/),
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
    if (c.devices.some((d) => !d.id.startsWith(c.adapter + ':')))
      ctx.addIssue({
        code: 'custom',
        message: 'Device belongs to a different adapter',
      });
  });
export type Config = z.infer<typeof configSchema>;
export function defaultConfig(mock = false): Config {
  return {
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
export function loadConfig(dir: string): Config {
  return configSchema.parse(readJSON(join(dir, 'config.json')));
}
export function acquireLock(dir: string): () => void {
  const path = join(dir, 'bridge.lock');
  const fd = openSync(path, 'wx', 0o600);
  writeFileSync(fd, String(process.pid));
  closeSync(fd);
  return () => unlinkSync(path);
}
