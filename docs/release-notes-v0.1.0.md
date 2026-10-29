# HomeKit RGB Bridge v0.1.0 — Experimental Preview

**Draft release notes — publication requires explicit maintainer approval. No tag or Release is created by the candidate workflow.**

Control compatible Windows PC RGB lighting through Apple Home without Homebridge, cloud services or extra hardware. This candidate adds a protected local configuration panel, optional experimental zone lights, logical groups, backed-up migrations and a portable Windows x64 distribution with an official bundled Node runtime.

## Changes

- Dashboard, discovery/selection/rename, groups, bridge lifecycle controls, diagnostics and explicit private pairing QR/PIN reveal.
- Conservative per-LED zone range mapping, zero-LED/ambiguous/global-only rejection and explicit experimental opt-in.
- Group partial-failure reporting and coalesced slider commands with latest-state preservation.
- Versioned config/state migration with private backups, preserved whole-device identities and user-selected ports.
- Heartbeat lock recovery and hidden user-level Windows sign-in startup without unnecessary bridge elevation.
- Portable ZIP, SHA-256 checksums, retained dependency/runtime licenses and extracted Windows runtime/launcher smoke checks.

## Verified evidence

The maintainer reports Windows baseline install/build/lint/original 43 tests, virtual and hardware HomeKit pairing, physical SDK discovery and **physical Corsair Vengeance RGB DDR5 color changes**. The hub, mouse and motherboard were discovered only. New automated unit/integration, browser and packaging checks are described in [verification](verification.md); attach links to the exact successful candidate CI before publishing.

## Requirements and installation

Windows 10/11 x64, permitted Windows Script Host, a modern browser, separately installed OpenRGB and a trusted local network with Apple Home. For RGB RAM, configure PawnIO/OpenRGB permissions according to upstream instructions. No system Node/npm or development tools are required for the portable ZIP.

Verify the ZIP against `SHA256SUMS-windows-x64.txt`, extract it fully and run `Launch-Bridge.vbs`. Select a private profile, configure the backend/SDK, discover/select lights, confirm/save, start and reveal pairing privately. See [Windows installation](installation-windows.md).

## Upgrade and uninstall

Stop the old bridge/task; privately back up the complete profile. Launch the new package with the **exact same** profile folder to retain pairing/whole-device IDs/port. Confirmed saves back up before version-1 writes. New zone/group accessories may need Home room/automation reassignment. To roll back, use the matching full backup with the matching older code. Re-enable autostart after moving the application folder.

Disable autostart and Quit before deleting application files. Profiles/backups and separate OpenRGB/PawnIO installations are retained unless deliberately removed. Full procedures: [installation-windows.md](installation-windows.md).

## Known limitations and warnings

- Experimental software; not Apple-certified. PC, bridge and OpenRGB must remain running.
- Device support depends on exact OpenRGB/controller/firmware behavior. Competing manufacturer utilities, including iCUE, can interfere.
- Off sends black instead of cutting electrical power. Brightness scales RGB values. Protocol-3 socket acceptance is not physical acknowledgment/readback.
- Physical zone isolation, groups, brightness/off, reconnect, other devices, fresh Windows desktops and candidate upgrade/lifecycle checks remain unverified until checklist evidence exists.
- No native installer, single-file EXE, tray UI, Windows service, signed project package or arm64 build. Script/SmartScreen policy may warn or block unsigned launchers; no security settings are changed.
- Startup is at user sign-in; OpenRGB starts separately. Forced termination cannot guarantee cleanup, though abandoned locks are recoverable. Legacy PID reuse can require inspection.
- Group failures can leave partial physical output; no automatic rollback writes are attempted.

Before publication, review [release gates](releases.md) and [manual matrix](manual-verification.md). Keep the GitHub release flagged **pre-release** while these physical checks remain incomplete.
