import { createHash } from 'node:crypto';
import { win32 } from 'node:path';
import { z } from 'zod';
import { openRGBArguments } from './settings.js';
import {
  psArguments,
  psLiteral,
  runPowerShell,
  windowsTool,
} from './windows-tools.js';
export const managedTaskDescription =
  'HomeKit RGB Bridge managed OpenRGB startup v1';
export interface TaskContext {
  sid: string;
  name: string;
}
export interface TaskTarget {
  path: string;
  host: string;
  port: number;
}
export type TaskStatus =
  'configured' | 'needs-update' | 'missing' | 'foreign' | 'unknown';
export function taskContext(sid: string): TaskContext {
  if (!/^S-\d+(?:-\d+)+$/.test(sid))
    throw Error('Windows account could not be checked.');
  return {
    sid,
    name:
      'HomeKitRGBBridge-OpenRGB-' +
      createHash('sha256').update(sid).digest('hex').slice(0, 12),
  };
}
export async function currentTaskContext() {
  if (process.platform !== 'win32')
    throw Error('Windows startup setup is only available on Windows.');
  const result = await runPowerShell(
    '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
  );
  if (result.code !== 0) throw Error('Windows account could not be checked.');
  return taskContext(result.stdout.trim());
}
function validateTarget(target: TaskTarget) {
  if (
    !win32.isAbsolute(target.path) ||
    win32.basename(target.path).toLowerCase() !== 'openrgb.exe' ||
    /["\r\n\0]/.test(target.path)
  )
    throw Error('Choose your installed OpenRGB.exe first.');
  return openRGBArguments(target.host, target.port).join(' ');
}
function commonScript(context: TaskContext) {
  const expected = taskContext(context.sid);
  if (expected.name !== context.name)
    throw Error('Unrecognized Windows startup task.');
  return `$ErrorActionPreference = 'Stop'
$sid = ${psLiteral(context.sid)}
$name = ${psLiteral(context.name)}
$description = ${psLiteral(managedTaskDescription)}
function Get-UserSid($id) { if ($id -match '^S-') { return $id }; return ([Security.Principal.NTAccount]$id).Translate([Security.Principal.SecurityIdentifier]).Value }
function Get-ManagedTask { return Get-ScheduledTask -TaskPath '\\' -ErrorAction Stop | Where-Object { $_.TaskName -eq $name } }
function Test-Owned($task) {
 if ($task.Description -ne $description -or @( $task.Actions ).Count -ne 1 -or (Get-UserSid $task.Principal.UserId) -ne $sid) { return $false }
 return ([IO.Path]::GetFileName($task.Actions[0].Execute) -ieq 'OpenRGB.exe') -and ($task.Actions[0].Arguments -match '^--server --server-host (127\\.0\\.0\\.1|localhost|::1) --server-port [0-9]{4,5} --gui --startminimized$')
}
`;
}
export function queryTaskScript(context: TaskContext) {
  return (
    commonScript(context) +
    `
try {
 $task = Get-ManagedTask
 if (!$task) { @{ status = 'missing' } | ConvertTo-Json -Compress; exit 0 }
 if (!(Test-Owned $task)) { @{ status = 'foreign' } | ConvertTo-Json -Compress; exit 0 }
 @{ status = 'owned'; path = [string]$task.Actions[0].Execute; arguments = [string]$task.Actions[0].Arguments; workingDirectory = [string]$task.Actions[0].WorkingDirectory; highest = (@('Highest', '1') -contains [string]$task.Principal.RunLevel); interactive = (@('Interactive', '3') -contains [string]$task.Principal.LogonType); logon = (@($task.Triggers).Count -eq 1 -and $task.Triggers[0].CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' -and (Get-UserSid $task.Triggers[0].UserId) -eq $sid); enabled = [bool]$task.Settings.Enabled; ignoreNew = (@('IgnoreNew', '2') -contains [string]$task.Settings.MultipleInstances) } | ConvertTo-Json -Compress
} catch { exit 1 }
`
  );
}
const reportSchema = z.union([
  z.object({ status: z.enum(['missing', 'foreign']) }),
  z.object({
    status: z.literal('owned'),
    path: z.string(),
    arguments: z.string(),
    workingDirectory: z.string(),
    highest: z.boolean(),
    interactive: z.boolean(),
    logon: z.boolean(),
    enabled: z.boolean(),
    ignoreNew: z.boolean(),
  }),
]);
export async function managedTaskStatus(
  target?: TaskTarget,
): Promise<TaskStatus> {
  if (process.platform !== 'win32') return 'missing';
  try {
    const context = await currentTaskContext();
    const result = await runPowerShell(queryTaskScript(context));
    if (result.code !== 0) return 'unknown';
    const report = reportSchema.parse(JSON.parse(result.stdout));
    if (report.status !== 'owned') return report.status;
    if (!target) return 'configured';
    return report.path.toLowerCase() === target.path.toLowerCase() &&
      report.arguments === validateTarget(target) &&
      report.workingDirectory.toLowerCase() ===
        win32.dirname(target.path).toLowerCase() &&
      report.highest &&
      report.interactive &&
      report.logon &&
      report.enabled &&
      report.ignoreNew
      ? 'configured'
      : 'needs-update';
  } catch {
    return 'unknown';
  }
}
export function configureTaskScript(context: TaskContext, target?: TaskTarget) {
  const args = target && validateTarget(target);
  return (
    commonScript(context) +
    `
try {
 if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne $sid) { exit 20 }
 $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
 if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 21 }
 $existing = Get-ManagedTask
 if ($existing -and !(Test-Owned $existing)) { exit 22 }
 ${
   target
     ? `
 $exe = ${psLiteral(target.path)}
 if (!(Test-Path -LiteralPath $exe -PathType Leaf)) { exit 23 }
 # Elevated recurring execution is restricted to an administrator-protected installation.
 $roots = @([Environment]::GetFolderPath('ProgramFiles'), [Environment]::GetFolderPath('ProgramFilesX86')) | Where-Object { $_ }
 $root = $roots | Where-Object { $exe.StartsWith($_.TrimEnd('\\') + '\\', [StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1
 if (!$root) { exit 24 }
 $trusted = @('S-1-5-18', 'S-1-5-32-544', ([Security.Principal.NTAccount]'NT SERVICE\\TrustedInstaller').Translate([Security.Principal.SecurityIdentifier]).Value)
 $write = [Security.AccessControl.FileSystemRights]'Write,Delete,ChangePermissions,TakeOwnership,DeleteSubdirectoriesAndFiles'
 $item = Get-Item -LiteralPath $exe -Force
 while ($item) {
   if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { exit 24 }
   $acl = Get-Acl -LiteralPath $item.FullName
   if ($trusted -notcontains (Get-UserSid $acl.Owner)) { exit 24 }
   foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
     if ($rule.AccessControlType -eq 'Allow' -and !($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -and ($rule.FileSystemRights -band $write) -and $trusted -notcontains $rule.IdentityReference.Value) { exit 24 }
   }
   if ($item.FullName.TrimEnd('\\') -ieq $root.TrimEnd('\\')) { break }
   $item = if ($item -is [IO.DirectoryInfo]) { $item.Parent } else { $item.Directory }
 }
 $action = New-ScheduledTaskAction -Execute $exe -WorkingDirectory ${psLiteral(win32.dirname(target.path))} -Argument ${psLiteral(args!)}
 $trigger = New-ScheduledTaskTrigger -AtLogOn -User $sid
 $user = New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Highest
 $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
 Register-ScheduledTask -TaskPath '\\' -TaskName $name -Action $action -Trigger $trigger -Principal $user -Settings $settings -Description $description -Force | Out-Null
 `
     : `if ($existing) { Unregister-ScheduledTask -TaskPath '\\' -TaskName $name -Confirm:$false }`
 }
 exit 0
} catch { exit 1 }
`
  );
}
export function elevatedSetupScript(script: string) {
  const argumentsText = psArguments(script).join(' ');
  return `$ErrorActionPreference = 'Stop'
try {
 $p = Start-Process -FilePath ${psLiteral(windowsTool('WindowsPowerShell\\v1.0\\powershell.exe'))} -ArgumentList ${psLiteral(argumentsText)} -Verb RunAs -WindowStyle Hidden -Wait -PassThru
 exit $p.ExitCode
} catch { if (($_.Exception.NativeErrorCode -eq 1223) -or ($_.Exception.InnerException.NativeErrorCode -eq 1223)) { exit 1223 }; exit 1 }
`;
}
export async function configureManagedTask(target?: TaskTarget) {
  const context = await currentTaskContext();
  if (!target && (await managedTaskStatus()) === 'missing') return;
  const result = await runPowerShell(
    elevatedSetupScript(configureTaskScript(context, target)),
    120000,
  );
  if (result.code === 1223)
    throw Error(
      'Windows startup setup was canceled. Your startup choices were not changed.',
    );
  if (result.code === 20 || result.code === 21)
    throw Error(
      'Use the same Windows administrator account that you sign in with to configure RAM startup.',
    );
  if (result.code === 22)
    throw Error(
      'An unrelated task uses this startup name. It was not changed.',
    );
  if (result.code === 24)
    throw Error(
      'Install OpenRGB inside an administrator-protected Program Files folder to enable unattended RAM startup.',
    );
  if (result.code !== 0)
    throw Error(
      'Windows could not configure OpenRGB startup. Check your account permissions and OpenRGB installation.',
    );
  const actual = await managedTaskStatus(target);
  if (target ? actual !== 'configured' : actual !== 'missing')
    throw Error(
      'Windows startup could not be verified. Check the scheduled task before continuing.',
    );
}
export async function runManagedOpenRGBTask(target: TaskTarget) {
  if ((await managedTaskStatus(target)) !== 'configured')
    throw Error(
      'Set up automatic RAM startup in Settings first, or update it after changing the OpenRGB path or port.',
    );
  const context = await currentTaskContext();
  const result = await runPowerShell(
    commonScript(context) +
      "\nStart-ScheduledTask -TaskPath '\\' -TaskName $name",
  );
  if (result.code !== 0)
    throw Error(
      'Windows could not start the configured OpenRGB task. Check Windows Task Scheduler.',
    );
}
