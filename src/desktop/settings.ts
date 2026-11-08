import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve, basename } from 'node:path';
import { z } from 'zod';
import {
  ensurePrivateDirectory,
  readJSON,
  writeJSON,
} from '../config/config-manager.js';

export const desktopSettingsSchema = z.strictObject({
  version: z.literal(1),
  profile: z.string().refine(isAbsolute, 'Choose an absolute profile folder'),
  openRGBPath: z.string().default(''),
  launchOpenRGB: z.boolean().default(false),
  setupComplete: z.boolean().default(false),
});
export type DesktopSettings = z.infer<typeof desktopSettingsSchema>;
export function loadDesktopSettings(
  dir: string,
  defaultProfile: string,
): DesktopSettings {
  const file = join(dir, 'desktop-settings.json');
  return desktopSettingsSchema.parse(
    existsSync(file)
      ? readJSON(file)
      : {
          version: 1,
          profile: resolve(defaultProfile),
        },
  );
}
export function saveDesktopSettings(dir: string, value: DesktopSettings) {
  const settings = desktopSettingsSchema.parse(value);
  ensurePrivateDirectory(dir);
  writeJSON(join(dir, 'desktop-settings.json'), settings);
  return settings;
}
export function profileCandidates(defaultProfile: string) {
  return [defaultProfile, defaultProfile + '-Hardware']
    .filter((dir) => existsSync(join(dir, 'config.json')))
    .map((dir) => ({ name: basename(dir), path: resolve(dir) }));
}
export function findOpenRGB(env: NodeJS.ProcessEnv = process.env): string {
  const candidates = [
    env.ProgramFiles && join(env.ProgramFiles, 'OpenRGB', 'OpenRGB.exe'),
    env['ProgramFiles(x86)'] &&
      join(env['ProgramFiles(x86)']!, 'OpenRGB', 'OpenRGB.exe'),
    env.LOCALAPPDATA &&
      join(env.LOCALAPPDATA, 'Programs', 'OpenRGB', 'OpenRGB.exe'),
  ];
  return candidates.find((p) => p && existsSync(p)) || '';
}
export function openRGBArguments(host: string, port: number): string[] {
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(host) ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  )
    throw new Error('OpenRGB requires a loopback host and port 1024–65535');
  return [
    '--server',
    '--server-host',
    host,
    '--server-port',
    String(port),
    '--gui',
    '--startminimized',
  ];
}
export function trustedDesktopFrame(url: string, origin: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === origin && parsed.pathname === '/desktop';
  } catch {
    return false;
  }
}
