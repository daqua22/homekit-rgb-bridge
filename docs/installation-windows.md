# Windows installation and operation

## Install from source

Target: Windows 10/11, PowerShell, Node 24 recommended, npm and Git. Node 22.15+ and 26 are also accepted by the bridge; CI tests Node 24/26. Check `node --version` and `npm --version` first. Node and OpenRGB are separately installed prerequisites, not bundled downloads.

```powershell
git clone https://github.com/daqua22/homekit-rgb-bridge.git
cd homekit-rgb-bridge
npm ci
npm run check
npm start -- init --mock
npm start -- start --pairing
```

`npm run check` includes the build. On a normal restart use `npm start`. The optional [Start-Bridge.cmd](../Start-Bridge.cmd) runs the compiled CLI from its own directory and forwards arguments. It does not install dependencies, register services or change firewall settings.

The default private directory is `%LOCALAPPDATA%\HomeKitRGBBridge`. `--data-dir "C:\some\private\directory"` overrides it on every command. Use a per-user private folder outside the checkout. Never use a shared folder or commit its files.

## Node preview archive

This repository prepares a `.tar.gz` archive containing compiled JavaScript, docs, lockfile and notices. It is a **Windows Node preview**, not an `.exe` or installer. No runtime or OpenRGB is embedded. Until a release exists, build it yourself with `npm run build; npm run licenses; npm run package:preview; npm run package:verify`, or inspect a successful CI artifact.

When an archive and its matching `SHA256SUMS.txt` are available:

```powershell
Get-FileHash .\homekit-rgb-bridge-0.1.0-dev.0-windows-node-preview.tar.gz -Algorithm SHA256
# Compare the complete value with SHA256SUMS.txt from the same build.
tar -xzf .\homekit-rgb-bridge-0.1.0-dev.0-windows-node-preview.tar.gz
cd .\homekit-rgb-bridge-0.1.0-dev.0-windows-node-preview
npm ci --omit=dev --ignore-scripts
node dist\index.js init --mock
.\Start-Bridge.cmd start --pairing
```

Archive version names change with `package.json`. Build tools and test sources are intentionally omitted: development commands belong in a full source checkout. Runtime package installation uses the unmodified lockfile.

## Run at sign-in with Task Scheduler

This is a background Node process under your account, **not a Windows service**. First complete pairing and manual operation. Then:

1. Start OpenRGB at sign-in with its SDK server enabled; follow its own instructions and verify its loopback binding.
2. Open Task Scheduler → Create Task. Use your normal Windows account, **Run only when user is logged on**, and no highest-privileges option unless you independently need one.
3. Add an **At log on** trigger, optionally with a 30-second delay.
4. Set Program to the absolute path returned by `(Get-Command node).Source`.
5. Set Arguments to `"C:\path\homekit-rgb-bridge\dist\index.js" start --data-dir "C:\Users\YOUR_USER\AppData\Local\HomeKitRGBBridge"` using your actual paths. Set Start in to the project directory.
6. Configure restart-on-failure conservatively and **Do not start a new instance**. Do not include `--pairing` or redirect private setup output.
7. Run the task manually and complete [Windows restart verification](manual-verification.md).

The bridge retries while OpenRGB is down. After a forced process termination or crash, check no bridge process is still running before removing the private directory's stale `bridge.lock`. The lock is intentionally not reclaimed automatically. Task Scheduler operation/reboot recovery is not yet physically verified; do not rely on it unattended until you have tested your PC. Forced Windows termination cannot run signal cleanup.

## Network access

OpenRGB SDK: TCP 6742, loopback only. HomeKit: TCP 51826 by default, plus mDNS multicast UDP 5353 on the trusted local network. Apple devices must reach the PC. Windows Firewall may prompt for Node access: allow only a trusted Private network. This project never changes firewall settings automatically. PC sleep/offline means accessories are unavailable.

## Upgrade, rollback, uninstall

Stop the bridge and any scheduled task. Privately back up the **entire** data directory, including `identity.json`, `hap-storage`, config and state. Never upload this backup. Record the old commit/version. Update source with `git pull --ff-only`, run `npm ci`, `npm run check`, `npm start -- check`, then restart without changing data directory. Read release notes before an upgrade. V0 configuration has no migration system; invalid input fails startup rather than resetting it.

For archive upgrades, extract to a new directory, install runtime dependencies, point to the same private data directory and update scheduled-task paths. Roll back code and the corresponding private backup together if schema changes prevent startup. Never delete HAP keys as a routine troubleshooting step.

To uninstall, disable/remove your task, stop Node and delete the project/archive directory. Delete private application data only if you deliberately want to forget pairings; first remove the bridge from Apple Home. Separately installed Node/OpenRGB remain under your control.
