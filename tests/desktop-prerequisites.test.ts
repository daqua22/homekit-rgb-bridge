import { expect, it, vi } from 'vitest';
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  OpenRGBStartup,
  validOpenRGBExecutable,
  pawnIODriverStatus,
} from '../src/desktop/prerequisites.js';
import {
  configureTaskScript,
  queryTaskScript,
  elevatedSetupScript,
  taskContext,
  managedTaskStatus,
  currentTaskContext,
} from '../src/desktop/startup-task.js';
import {
  psArguments,
  runPowerShell,
  runWindowsCommand,
  windowsTool,
} from '../src/desktop/windows-tools.js';
import { randomUUID } from 'node:crypto';
const options = {
  path: "C:\\Program Files\\RGB's folder\\OpenRGB.exe",
  host: '127.0.0.1',
  port: 6742,
  administrator: false,
};
function fixture(
  overrides: ConstructorParameters<typeof OpenRGBStartup>[0] = {},
) {
  let time = 0;
  const launch = vi.fn(async () => {});
  const service = new OpenRGBStartup({
    platform: 'win32',
    valid: () => true,
    running: async () => false,
    listening: async () => false,
    launch,
    pause: async (ms) => {
      time += ms;
    },
    now: () => time,
    waitMs: 1000,
    ...overrides,
  });
  return { service, launch };
}
it('coalesces startup requests and waits for the SDK instead of spawning duplicate apps', async () => {
  let probes = 0;
  const { service, launch } = fixture({ listening: async () => ++probes >= 3 });
  const results = await Promise.all([
    service.ensure(options),
    service.ensure(options),
    service.ensure(options),
  ]);
  expect(launch).toHaveBeenCalledTimes(1);
  expect(results.every((state) => state.ready && state.started)).toBe(true);
});
it('reuses an existing SDK listener without launching or elevating another app', async () => {
  const { service, launch } = fixture({
    valid: () => false,
    listening: async () => true,
  });
  expect(
    (await service.ensure({ ...options, administrator: true })).ready,
  ).toBe(true);
  expect(launch).not.toHaveBeenCalled();
});
it('does not duplicate an existing OpenRGB process whose SDK server is disabled', async () => {
  const { service, launch } = fixture({ running: async () => true });
  const state = await service.ensure(options);
  expect(state.phase).toBe('attention');
  expect(state.message).toContain('Enable the SDK Server in that copy');
  expect(launch).not.toHaveBeenCalled();
});
it('shows a bounded startup timeout and permits an explicit retry', async () => {
  let ready = false;
  const { service, launch } = fixture({ listening: async () => ready });
  expect((await service.ensure(options)).phase).toBe('attention');
  ready = true;
  expect((await service.ensure(options)).ready).toBe(true);
  expect(launch).toHaveBeenCalledTimes(1);
});
it('cancels pending detection on quit without launching a new hardware process', async () => {
  let release!: (value: boolean) => void;
  const { service, launch } = fixture({
    listening: () =>
      new Promise((r) => {
        release = r;
      }),
  });
  const pending = service.ensure(options);
  service.cancel();
  release(false);
  await pending;
  expect(launch).not.toHaveBeenCalled();
});
it('refuses a missing executable or unknown process state rather than opening another copy', async () => {
  const missing = fixture({ valid: () => false });
  expect((await missing.service.ensure(options)).message).toContain(
    'Choose your installed',
  );
  expect(missing.launch).not.toHaveBeenCalled();
  const unknown = fixture({
    running: async () => {
      throw Error('Process state unavailable');
    },
  });
  expect((await unknown.service.ensure(options)).phase).toBe('attention');
  expect(unknown.launch).not.toHaveBeenCalled();
});
it('accepts an executable file, not a directory merely named OpenRGB.exe', () => {
  const root = mkdtempSync(join(tmpdir(), 'rgb-executable-'));
  try {
    const path = join(root, 'OpenRGB.exe');
    mkdirSync(path);
    expect(validOpenRGBExecutable(path)).toBe(false);
    rmSync(path, { recursive: true });
    writeFileSync(path, 'synthetic fixture');
    expect(validOpenRGBExecutable(path)).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it('creates fixed per-user startup actions and rejects script or task-name injection', () => {
  const context = taskContext('S-1-5-21-100-200-300-1001');
  const script = configureTaskScript(context, options);
  expect(script).toContain("RGB''s folder");
  expect(script).toContain('-RunLevel Highest');
  expect(script).toContain('-LogonType Interactive');
  expect(script).toContain('-AtLogOn -User $sid');
  expect(script).toContain('-MultipleInstances IgnoreNew');
  expect(script).not.toContain('-Password');
  expect(psArguments(script).slice(0, 4)).toEqual([
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
  ]);
  expect(() => taskContext("x'; Write-Output injected")).toThrow();
  expect(() =>
    configureTaskScript({ ...context, name: 'Unrelated task' }, options),
  ).toThrow();
  expect(() =>
    configureTaskScript(context, { ...options, host: '0.0.0.0' }),
  ).toThrow();
  expect(() =>
    configureTaskScript(context, {
      ...options,
      path: 'C:\\bad"; test\\OpenRGB.exe',
    }),
  ).toThrow();
});
it.runIf(process.platform === 'win32')(
  'Windows parses the setup/query/removal scripts without executing user path text',
  async () => {
    const context = taskContext('S-1-5-21-100-200-300-1001');
    const target = {
      ...options,
      path: "C:\\Program Files\\RGB's $(Write-Output injected); folder\\OpenRGB.exe",
    };
    const scripts = [
      configureTaskScript(context, target),
      queryTaskScript(context),
      configureTaskScript(context),
      elevatedSetupScript(configureTaskScript(context, target)),
    ];
    for (const source of scripts) {
      const encoded = Buffer.from(source, 'utf16le').toString('base64');
      const check = `$s=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encoded}')); $t=$null; $e=$null; $ast=[Management.Automation.Language.Parser]::ParseInput($s,[ref]$t,[ref]$e); @{ errors=@($e).Count; injected=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Write-Output'},$true)).Count } | ConvertTo-Json -Compress`;
      const result = await runPowerShell(check);
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ errors: 0, injected: 0 });
    }
    expect(['installed', 'missing']).toContain(await pawnIODriverStatus());
  },
  30000,
);
it.runIf(process.platform === 'win32' && !!process.env.CI)(
  'registers, verifies, detects changed settings and removes a real isolated Windows startup task',
  async () => {
    const elevated = await runPowerShell(
      '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
    );
    if (elevated.stdout.trim() !== 'True')
      throw Error(
        'Windows CI requires its administrator test token for the isolated task check.',
      );
    const context = await currentTaskContext();
    if ((await managedTaskStatus()) !== 'missing')
      throw Error('Refusing to modify a pre-existing startup task.');
    const folder = join(
      process.env.ProgramFiles!,
      'HomeKitRGBBridge-CI-' + randomUUID(),
    );
    const executable = join(folder, 'OpenRGB.exe');
    let created = false;
    try {
      mkdirSync(folder);
      copyFileSync(process.execPath, executable);
      const aclCommands = [
        [folder, '/setowner', '*S-1-5-32-544', '/T', '/C', '/Q'],
        [
          folder,
          '/inheritance:r',
          '/grant:r',
          '*S-1-5-32-544:(OI)(CI)F',
          '*S-1-5-18:(OI)(CI)F',
          '*S-1-5-32-545:(OI)(CI)RX',
          '/Q',
        ],
        [folder, '/remove:g', '*' + context.sid, '/Q'],
        [executable, '/reset', '/Q'],
      ];
      for (let index = 0; index < aclCommands.length; index++) {
        const result = await runWindowsCommand(
          windowsTool('icacls.exe'),
          aclCommands[index]!,
        );
        if (result.code !== 0)
          throw Error(
            'Protected fixture ACL preparation failed at step ' +
              index +
              ' with code ' +
              result.code +
              '.',
          );
      }
      const target = { ...options, path: executable };
      const result = await runPowerShell(configureTaskScript(context, target));
      created = true; // Cleanup also covers a partial registration failure.
      expect(result.code).toBe(0);
      expect(await managedTaskStatus(target)).toBe('configured');
      expect(await managedTaskStatus({ ...target, port: 6750 })).toBe(
        'needs-update',
      );
      expect((await runPowerShell(configureTaskScript(context))).code).toBe(0);
      expect(await managedTaskStatus()).toBe('missing');
      created = false;
    } finally {
      if (created) await runPowerShell(configureTaskScript(context));
      rmSync(folder, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  },
  120000,
);
