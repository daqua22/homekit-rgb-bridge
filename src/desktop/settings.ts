import { existsSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve, basename, dirname } from 'node:path';
import { z } from 'zod';
import {
  ensurePrivateDirectory,
  loadConfig,
  readJSON,
  writeJSON,
} from '../config/config-manager.js';
import { readLauncher, startupFile } from '../windows/startup.js';

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
export interface ProfileCandidate {
  name: string;
  path: string;
  bridgeName?: string;
  adapter?: 'mock' | 'openrgb';
  lights?: number;
  hasIdentity: boolean;
  hasHomeKitData: boolean;
  available: boolean;
  problem?: string;
}
/** Read metadata only. Never open pairing keys or create/migrate a profile. */
export function profileCandidates(
  defaultProfile: string,
  additional: string[] = [],
  appData = process.platform === 'win32' ? process.env.APPDATA : undefined,
): ProfileCandidate[] {
  const paths = new Set([
    ...additional.map((p) => resolve(p)),
    resolve(defaultProfile),
  ]);
  const base = basename(defaultProfile).toLowerCase();
  try {
    for (const entry of readdirSync(dirname(defaultProfile), {
      withFileTypes: true,
    }))
      if (
        entry.isDirectory() &&
        entry.name.toLowerCase().startsWith(base + '-')
      )
        paths.add(join(dirname(defaultProfile), entry.name));
  } catch {
    /* A missing/unreadable search folder must not break the current profile. */
  }
  // Legacy launchers can locate a custom --data-dir without searching the whole PC.
  if (appData) {
    const startup = dirname(startupFile(defaultProfile, appData));
    try {
      for (const entry of readdirSync(startup, { withFileTypes: true })) {
        if (
          !entry.isFile() ||
          !/^HomeKitRGBBridge-[a-f0-9]{12}\.vbs$/i.test(entry.name)
        )
          continue;
        const file = join(startup, entry.name);
        try {
          if (statSync(file).size > 16384) continue;
          const script = readLauncher(file);
          if (
            !script.startsWith(
              "' HomeKit RGB Bridge: user-level background launcher",
            )
          )
            continue;
          const command = script
            .match(/^shell\.Run "([^\r\n]*)", 0, False\r?$/m)?.[1]
            ?.replaceAll('""', '"');
          const profile = command?.match(
            /^"[^"\r\n]+" "[^"\r\n]+" app --data-dir "([^"\r\n]+)"(?: --open)?$/,
          )?.[1];
          if (
            profile &&
            isAbsolute(profile) &&
            basename(startupFile(profile, appData)).toLowerCase() ===
              entry.name.toLowerCase()
          )
            paths.add(resolve(profile));
        } catch {
          /* Ignore an unreadable or unrecognized launcher; never execute it. */
        }
      }
    } catch {
      /* No legacy startup directory. */
    }
  }
  const seen = new Set<string>();
  const result: ProfileCandidate[] = [];
  for (const path of paths) {
    const key = process.platform === 'win32' ? path.toLowerCase() : path;
    if (seen.has(key) || !existsSync(join(path, 'config.json'))) continue;
    seen.add(key);
    const candidate = inspectProfile(path);
    if (candidate) result.push(candidate);
  }
  return result;
}
export function inspectProfile(path: string): ProfileCandidate | undefined {
  if (!existsSync(join(path, 'config.json'))) return;
  const candidate: ProfileCandidate = {
    name: basename(path),
    path,
    hasIdentity: existsSync(join(path, 'identity.json')),
    hasHomeKitData: false,
    available: false,
  };
  let storageReadable = true;
  try {
    candidate.hasHomeKitData =
      readdirSync(join(path, 'hap-storage')).length > 0;
  } catch {
    storageReadable = !existsSync(join(path, 'hap-storage'));
  }
  try {
    const config = loadConfig(path);
    candidate.bridgeName = config.homekit.name;
    candidate.adapter = config.adapter;
    candidate.lights =
      config.devices.filter((d) => d.enabled).length +
      config.groups.filter((g) => g.enabled).length;
    if (!storageReadable)
      candidate.problem =
        'The HomeKit storage is unreadable. Check folder permissions before opening this profile.';
    else if (candidate.hasHomeKitData && !candidate.hasIdentity)
      candidate.problem =
        'HomeKit data exists but identity.json is missing. Restore the original identity from your private backup.';
    else candidate.available = true;
  } catch {
    candidate.problem =
      'The profile configuration is unreadable or unsupported. Check it before opening this profile.';
  }
  return candidate;
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
