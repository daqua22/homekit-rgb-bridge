# Windows installation, upgrade and uninstall

## Portable x64 candidate

The Windows x64 ZIP bundles an unmodified official Node 24 executable, production dependencies, compiled bridge, local web UI, notices and background launcher. It is not a single-file executable, installer, native tray app or Windows service. No arm64 build is offered. Build provenance is pinned in `distribution-runtime.json`; the archive retains `runtime/LICENSE.txt` and `runtime/provenance.json`.

Download the candidate artifact from a successful PR/CI run while release publication awaits approval. CI artifacts require GitHub sign-in and expire after 14 days. A future approved pre-release will attach the validated ZIP, checksums and reviewed notes; do not assume a Release currently exists.

1. Extract the CI artifact download, if it wraps the portable ZIP/checksum files.
2. Compare the full checksum from the same build:

```powershell
Get-FileHash .\homekit-rgb-bridge-0.1.0-windows-x64-portable.zip -Algorithm SHA256
Get-Content .\SHA256SUMS-windows-x64.txt
```

3. Extract the entire portable ZIP to a stable per-user location, for example a folder under your Documents or LocalAppData. Keep `dist`, `public`, `node_modules` and `runtime` together.
4. Double-click **Launch-Bridge.vbs**. Its profile prompt defaults to `%LOCALAPPDATA%\HomeKitRGBBridge`. For existing hardware setups choose their **exact** existing path, often `%LOCALAPPDATA%\HomeKitRGBBridge-Hardware`.
5. The browser opens the protected local panel. No npm commands, system Node install or JSON editing are required. Use Settings → OpenRGB, Discover, select/rename devices, confirm/save and Start bridge.

The official bundled Node executable retains its upstream signature. The package and VBS scripts are not signed by this project. Windows may show SmartScreen, downloaded-file or script warnings. Verify the checksum and source before trusting a candidate. The application does not disable SmartScreen, security settings or script policies. If your organization disables Windows Script Host, the hidden launcher/autostart cannot work under that policy; use an approved deployment mechanism or source CLI. Report the limitation rather than bypassing organization controls.

## Existing-installation upgrade

Do not reset pairing, rename IDs or delete the old private data directory. The application reads legacy version-0 config and state **in memory**. Existing whole-device IDs, UUID seeds, identity.json, HAP storage, names and user-selected HomeKit ports are retained. Port 51827 is an existing installation choice, not a new default.

1. Stop the old bridge and disable its old scheduled task/Startup entry to avoid duplicate processes.
2. Privately back up the entire old data directory before upgrading. Backups contain credentials.
3. Extract the candidate into a new application folder. Launch it and choose the exact existing data directory.
4. Verify pairing and whole-device behavior before changing selections. Merely opening the UI does not rewrite config.
5. An explicit confirmed Save creates a complete private config/state/identity/HAP backup under `backups/`, then writes version 1. A legacy state file is similarly backed up before its first new-format state write.
6. If autostart points to an old application path, disable/re-enable it in the new app. Delete old application files only after checks pass.

No automatic migration changes whole-device accessory identities. Opting into new zones/groups creates new accessories; Apple Home room/automation associations for replaced whole-device lights may need reassignment. No silent hardware identity remapping is performed. Unknown future config/state versions fail validation.

For rollback, stop the candidate, retain its private directory privately, restore the appropriate full backup into a separate profile directory and run the matching older application. Older builds do not understand version-1 state/config; do not point one blindly at the upgraded files. Backups are never included in release artifacts.

## Background operation and autostart

The UI offers Start, Stop, Restart, Quit, status and recent diagnostics. Closing the browser leaves the app running. Reopen the launcher with the same data folder to reopen the existing panel. Quit application stops HAP, drains pending work, disconnects the adapter and releases locks through the authenticated API, including on Windows.

**Launch this profile at Windows sign-in** writes a profile-specific VBS launcher in the current user's Startup folder. It uses no elevation, service registration or firewall changes. It starts the bundled runtime hidden, without opening the browser or exposing secrets in command arguments. The application directory must remain available at the stored path. This mechanism requires sign-in; it does not run before login.

OpenRGB must start separately. Its hardware/SMBus access may require elevation, independently of the bridge. The bridge retries ordinary SDK failures. A heartbeat directory lock becomes recoverable after an abandoned instance is stale (10 seconds); live legacy PID markers are respected. Launch waits briefly for stale-lock recovery. An unrelated process reusing a legacy PID causes fail-closed refusal requiring inspection; never delete locks while a bridge may still run.

Actual desktop login, logout, Windows reboot and sleep/wake still need physical testing. CI exercises hidden VBS process launch, API stop/start, state/identity persistence and graceful quit; this is not a Windows desktop lifecycle certification. PC sleep/off prevents Home control.

## Network and local files

OpenRGB SDK: loopback TCP 6742 by default. HAP: TCP 51826 by default; preserve an existing port or choose another unused port in Settings. Discovery uses multicast UDP 5353. The administrative panel binds **127.0.0.1 only**, preferring 8787 and falling back to a free local port if occupied. Its private launch handoff supplies a random bearer credential; typing the HTTP address alone does not grant API access.

No automatic firewall changes occur. Allow HAP/mDNS only on trusted private networks. Never expose OpenRGB or administrative APIs to the internet. Inspect NTFS permissions and protect private application data and backups; see [SECURITY.md](../SECURITY.md).

## Source installation

```powershell
git clone https://github.com/daqua22/homekit-rgb-bridge.git
cd homekit-rgb-bridge
npm ci
npm run build
npm run app
```

Node 24 is recommended; Node 22.15+ and 26 are accepted by source scripts. The old CLI remains available through `npm start -- ...`. `Portable-CLI.cmd` in the bundled package uses its own runtime for advanced CLI tasks. A separate thin Node preview archive still requires installing Node/npm and runtime dependencies; use the portable ZIP for the no-npm experience.

## Uninstall

Disable autostart in the UI, Quit application, and remove any older manually configured task. Delete the extracted application folder. Private profiles and backups remain by design. Delete them only if you deliberately want to forget pairing/config/state, after removing the bridge from Apple Home. Separately installed OpenRGB/PawnIO are not removed by this application.
