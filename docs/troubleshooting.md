# Troubleshooting

Default errors intentionally avoid printing configuration and secret-bearing exception objects. Use the fixed log events and the checks below. Leave third-party `DEBUG` output disabled unless you can privately inspect and redact it.

| Symptom                             | Checks / action                                                                                                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup fails immediately           | Run `node --version`, `npm ci`, `npm run build`, then `npm start -- check`. Confirm valid JSON and documented ranges. Confirm you initialized the same data directory.                                    |
| `init` fails                        | It refuses to replace an existing config. Inspect/edit your existing config, or choose a new private directory.                                                                                           |
| `check` passes but start/list fails | Check directory permissions, `bridge.lock`, ports and OpenRGB. Stop the running bridge before `list`; both take the same lock.                                                                            |
| Stale `bridge.lock`                 | Check Task Scheduler and Task Manager to ensure no bridge Node process owns that data directory. Only then remove the lock. Never remove it while a process is running.                                   |
| `adapter_unavailable_retrying`      | Ensure OpenRGB SDK Server is running on configured loopback host/port. Inspect its version, SDK settings, and local TCP listener. A malformed/unsupported response also causes fail-closed reconnect.     |
| No devices listed                   | OpenRGB itself must detect them; mock config lists only the virtual light. No hardware drivers are implemented here.                                                                                      |
| Listed device is unsupported        | Read `capabilities.reason`. Require Direct/per-LED colors and matching nonzero LED/color counts. No fallback to guessed vendor commands.                                                                  |
| Ambiguous identity                  | Identical devices lack unique serial/location. They are rejected to avoid controlling the wrong hardware. Do not use numeric indices as a workaround; report redacted metadata.                           |
| Home light is unavailable           | Check OpenRGB connection and exact enabled ID. A device moved to a new port may acquire a new location-based ID. Restart after intentional config edits.                                                  |
| Home cannot discover bridge         | Same trusted LAN, PC awake, no guest isolation/VPN interference, mDNS UDP 5353 and HAP TCP 51826 accessible. Try explicit `homekit.bind` for the trusted LAN interface; it is not a firewall replacement. |
| HAP port busy                       | Another bridge/process uses the port. Stop the duplicate or select another valid `homekit.port`; never start duplicate instances with the same pairing identity.                                          |
| QR will not scan                    | Use a larger terminal font or enter the printed setup code manually. Do not upload the QR for help.                                                                                                       |
| Already paired / missing keys       | Retain the original data directory. Do not delete HAP data to troubleshoot networking. See deliberate reset instructions in [pairing](apple-home-pairing.md).                                             |
| Colors change back                  | Stop manufacturer utilities/effects plugins and other SDK clients. Bridge state is not synchronized with external writers.                                                                                |
| Off still consumes power            | Expected: off sends black; it does not switch controller/PC power.                                                                                                                                        |
| Brightness looks nonlinear          | Channel scaling and device gamma/firmware vary; no calibrated luminous output is promised.                                                                                                                |
| State lost after forced shutdown    | Backup/restore pairing and state privately. JSON replacement reduces partial writes but cannot guarantee crash/power-loss durability. Check disk/ACL problems.                                            |
| After Windows reboot                | Confirm OpenRGB/task startup, Node path and working directory. Check for a stale lock after a forced termination. Reboot recovery remains a manual validation requirement.                                |

Useful PowerShell diagnostics (inspect privately):

```powershell
node --version
npm --version
npm start -- check
Get-NetTCPConnection -State Listen -LocalPort 6742,51826
Get-Process node -ErrorAction SilentlyContinue
```

Do not kill all Node processes blindly; unrelated applications may use Node. Use Task Manager's command-line column privately to identify the correct bridge process. Never paste that full output if it includes private paths.

When filing a bug, give versions, adapter, steps, expected/actual behavior and redacted fixed-event logs. Do not attach identity/state/config/HAP storage or pairing terminal captures. Hardware reports belong in [the compatibility process](hardware-compatibility.md).
