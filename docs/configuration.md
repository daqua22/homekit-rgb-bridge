# Configuration and migrations

Use the local control panel for normal configuration. JSON editing is an advanced/source workflow. Profiles live outside the application: `%LOCALAPPDATA%\HomeKitRGBBridge` by default on Windows and `~/.homekit-rgb-bridge` on POSIX. The launcher can select a different existing profile; every CLI command accepts `--data-dir <path>`.

## Version 1

Legacy files without `version` load as version 1 in memory. No load operation overwrites them. Confirmed UI Save creates a full private backup first. A state write upgrades legacy state only after a backup; future versions are rejected. The bridge identity/HAP keys and existing whole-device state keys remain unchanged.

```json
{
  "version": 1,
  "adapter": "openrgb",
  "experimentalZones": false,
  "admin": { "port": 8787 },
  "openrgb": { "host": "127.0.0.1", "port": 6742, "timeoutMs": 3000 },
  "homekit": { "name": "HomeKit RGB Bridge", "port": 51826 },
  "devices": [],
  "groups": [],
  "connection": { "pollMs": 5000, "initialRetryMs": 1000, "maxRetryMs": 30000 },
  "logging": "info"
}
```

Safe complete examples: [hardware](../examples/config.openrgb.json), [mock](../examples/config.mock.json). No real hardware identifiers or pairing credentials are included.

## Select lights

Devices & zones shows physical controllers, manufacturers, LED counts and capability limitations. Only opt in to intended devices. Whole-device selections retain the exact previous device ID. New zone IDs combine the stable controller ID with a hash of the unique zone name; duplicate names, unknown partitions, global-only modes and zero-LED zones are ineligible. Firmware may still violate inferred isolation: explicit experimental consent and physical validation are required.

Whole-device and zone lights cannot overlap. Each target can belong to only one enabled standalone light or enabled group. Groups have stable generated `group:` IDs and one or more physical/zone members. Enabling a group does not auto-enable its members as separate HomeKit accessories. Invalid overlapping selections are rejected without modifying the saved configuration.

A confirmed Save checks the loaded config revision to avoid overwriting external edits, stops a running bridge, backs up config/state/identity/HAP storage, saves and restarts if previously running. It does not silently choose new ports or device IDs. Changing backend through the UI clears old selections on the explicit save, because mock and hardware IDs are incompatible. Names must be 1–64 ASCII letters/digits/spaces/apostrophes/hyphens, beginning/ending with a letter or digit. Maximum 100 enabled HomeKit lights.

## Settings

- `adapter`: `mock` or `openrgb`; IDs must match the backend.
- `openrgb.host`: loopback only (`127.0.0.1`, `localhost`, `::1`); port 1–65535; timeout 100–30000 ms.
- `homekit.port`: 1024–65535, default 51826, user-selected values preserved. OpenRGB, HomeKit and preferred admin ports must differ.
- `homekit.bind`: optional interface/address array (up to 16), preserved in upgrades. HAP-NodeJS may use a wildcard TCP listener even with interface filtering: use firewall isolation.
- `admin.port`: preferred local panel port 1024–65535, default 8787. The UI does not change this field mid-session. Source users can use `app --admin-port <port>`; a busy preferred default falls back to a free loopback port.
- `connection.pollMs`: 1000–60000; retry initial 100–60000 and maximum 100–300000, at least initial. Delays double to the cap.
- `logging`: error/info/debug, fixed event names without configuration, color values or credentials.

Unknown properties, duplicate IDs, invalid types/ranges and future versions fail validation. Config and state JSON reads are capped at 1 MiB. Files are atomically replaced through same-directory temporary files; this is not a transactional disk+hardware commit or power-loss durability guarantee.

## State semantics

On/off, hue, saturation and brightness represent last saved transport-accepted desired state. Off preserves hue/saturation/brightness and sends black. Brightness zero is black without changing desired `on`. Slider commands coalesce for 35 ms; every waiting caller receives the merged final transport result. Another RGB app's changes are not synchronized.

A group applies members serially and records successfully accepted members; any failed member returns failure and identifies accepted/failed targets in diagnostics. There is no compensating rollback write. Group state is saved only after all members succeed. Physical output can remain partially changed after failure; reconciliation on later reconnect restores saved desired values. Disk-write failure after a send likewise means output may have changed despite a failed operation.

## Private files

`identity.json` and `hap-storage/` hold credentials; `state.json` holds versioned desired lights; `backups/` contains private migration/reset snapshots. `bridge.lock` protects older CLI interoperability and `application.lock/` provides heartbeat exclusion/recovery. `admin-session.json` and `open-control.html` are private launch handoffs, removed on graceful exit. Logs rotate at 256 KiB, retaining one previous file; the UI shows up to 100 recent fixed events. No runtime file belongs in Git or a public report.
