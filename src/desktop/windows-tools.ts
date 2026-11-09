import { execFile } from 'node:child_process';
import { win32 } from 'node:path';
export function windowsTool(
  name:
    | 'sc.exe'
    | 'tasklist.exe'
    | 'icacls.exe'
    | 'WindowsPowerShell\\v1.0\\powershell.exe',
  env: NodeJS.ProcessEnv = process.env,
) {
  const root = env.SystemRoot || env.WINDIR || 'C:\\Windows';
  if (!win32.isAbsolute(root) || /[\r\n\0]/.test(root))
    throw Error('Windows system folder is unavailable.');
  return win32.join(root, 'System32', name);
}
export function runWindowsCommand(
  file: string,
  args: string[],
  timeout = 5000,
  input?: string,
): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      { windowsHide: true, timeout, maxBuffer: 65536 },
      (error, stdout) =>
        resolve({
          code: error
            ? typeof error.code === 'number'
              ? error.code
              : null
            : 0,
          stdout: error ? '' : stdout,
        }),
    );
    if (input !== undefined) {
      child.stdin?.on('error', () => {}); // A blocked/canceled helper can close its pipe early.
      child.stdin?.end(input);
    }
  });
}

export const psLiteral = (value: string) =>
  "'" + value.replaceAll("'", "''") + "'";
export function psArguments(script: string): string[] {
  return [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64'),
  ];
}
export function runPowerShell(script: string, timeout = 15000) {
  return runWindowsCommand(
    windowsTool('WindowsPowerShell\\v1.0\\powershell.exe'),
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $reader=[IO.StreamReader]::new([Console]::OpenStandardInput(),[Text.Encoding]::UTF8); & ([scriptblock]::Create($reader.ReadToEnd()))',
    ],
    timeout,
    script,
  );
}
