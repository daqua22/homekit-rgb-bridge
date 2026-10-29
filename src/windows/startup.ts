import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
export function launcherScript(
  node: string,
  entry: string,
  dir: string,
  open = false,
): string {
  for (const p of [node, entry, dir])
    if (/["\r\n\0]/.test(p)) throw new Error('Unsupported launcher path');
  const command = `"${resolve(node)}" "${resolve(entry)}" app --data-dir "${resolve(dir)}"${open ? ' --open' : ''}`;
  return `' HomeKit RGB Bridge: user-level background launcher\r\nSet shell = CreateObject("WScript.Shell")\r\nshell.Run "${command.replaceAll('"', '""')}", 0, False\r\n`;
}
export function startupFile(
  dir: string,
  appData = process.env.APPDATA,
): string {
  if (!appData) throw new Error('Windows APPDATA is unavailable');
  const hash = createHash('sha256')
    .update(resolve(dir).toLowerCase())
    .digest('hex')
    .slice(0, 12);
  return join(
    appData,
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup',
    `HomeKitRGBBridge-${hash}.vbs`,
  );
}
export function startupEnabled(dir: string): boolean {
  return process.platform === 'win32' && existsSync(startupFile(dir));
}
export function setStartup(
  dir: string,
  enable: boolean,
  node = process.execPath,
  entry = process.argv[1]!,
  appData = process.env.APPDATA,
  platform = process.platform,
): void {
  if (platform !== 'win32')
    throw new Error('Autostart is available on Windows only');
  const path = startupFile(dir, appData);
  if (enable) {
    mkdirSync(resolve(path, '..'), { recursive: true });
    const text = launcherScript(node, entry, dir);
    if (
      existsSync(path) &&
      readFileSync(path, 'utf8') !== text &&
      !readFileSync(path, 'utf8').startsWith("' HomeKit RGB Bridge:")
    )
      throw new Error(
        'Existing startup item was not created by this application',
      );
    writeFileSync(path, text, { mode: 0o600 });
  } else if (existsSync(path)) {
    if (!readFileSync(path, 'utf8').startsWith("' HomeKit RGB Bridge:"))
      throw new Error('Unrecognized startup item');
    unlinkSync(path);
  }
}
