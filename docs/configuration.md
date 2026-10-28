# Configuration

All runtime JSON lives in a private data directory, outside Git. Defaults: `%LOCALAPPDATA%\HomeKitRGBBridge` on Windows, `~/.homekit-rgb-bridge` on POSIX. Override with `--data-dir <path>` on every command. The program resolves paths but does not print them in default logs.

`init` writes a hardware configuration with no devices selected. `init --mock` selects the virtual light. Both refuse to overwrite an existing config. `check` validates config without starting networking. `list` connects and discovers without writing colors. `start` starts the persistent bridge; it is the default command. `--pairing` reveals private setup information only at startup. `--mock` is accepted only by `init`. `--help` lists syntax.

```json
{
  "adapter": "mock",
  "openrgb": { "host": "127.0.0.1", "port": 6742, "timeoutMs": 3000 },
  "homekit": { "name": "HomeKit RGB Bridge", "port": 51826 },
  "devices": [
    { "id": "mock:virtual-light", "name": "Virtual RGB Light", "enabled": true }
  ],
  "connection": { "pollMs": 5000, "initialRetryMs": 1000, "maxRetryMs": 30000 },
  "logging": "info"
}
```

A copy is in [examples/config.mock.json](../examples/config.mock.json). Hardware config: set `adapter` to `openrgb`, begin with `devices: []`, run `list`, then copy the exact returned IDs. IDs shown in reports are hashes; never substitute OpenRGB's mutable numeric index. Device selection is read at startup, so stop before editing and restart afterward.

| Setting                       | Validation / behavior                                                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adapter`                     | `mock` or `openrgb`; selected IDs must match the adapter                                                                                                                                                                  |
| `openrgb.host`                | Only `127.0.0.1`, `localhost` or `::1`; no remote host                                                                                                                                                                    |
| `openrgb.port`                | Integer 1–65535; default 6742                                                                                                                                                                                             |
| `openrgb.timeoutMs`           | Integer 100–30000; connect/request timeout                                                                                                                                                                                |
| `homekit.name`, device `name` | 1–64 ASCII letters/digits/spaces/apostrophes/hyphens; begin/end with a letter/digit                                                                                                                                       |
| `homekit.port`                | Integer 1024–65535, default 51826; choose an unused port                                                                                                                                                                  |
| `homekit.bind`                | Optional array of up to 16 interface names or addresses, passed to HAP-NodeJS; omitted advertises on available interfaces. HAP binding semantics may still use a wildcard TCP listener; use firewall rules for isolation. |
| `devices`                     | Up to 100 unique IDs with `name` and boolean `enabled`; disabled devices are not exposed                                                                                                                                  |
| `pollMs`                      | 1000–60000, inventory refresh interval                                                                                                                                                                                    |
| `initialRetryMs`              | 100–60000; first failed-connection retry                                                                                                                                                                                  |
| `maxRetryMs`                  | 100–300000 and at least initial; delays double to this cap                                                                                                                                                                |
| `logging`                     | `error`, `info`, `debug`; fixed structured events, no color values or credentials                                                                                                                                         |

Unknown properties, duplicate IDs, invalid types and out-of-range values are rejected. There is no hot reload. JSON must be valid (no comments/trailing commas). Runtime JSON files are capped at 1 MiB when read.

Other files: `identity.json` stores generated setup credentials; `hap-storage/` holds HAP-NodeJS keys/cache; `state.json` stores last transport-accepted desired on/hue/saturation/brightness; `bridge.lock` enforces one instance. Do not hand-edit identity or HAP storage. Files are replaced through same-directory temporary writes; this reduces partial writes but is not a transactional hardware+disk commit or a power-loss guarantee.

Software off preserves desired hue, saturation and brightness. Brightness zero is black and does not change the desired `on` boolean. Changes from other apps are not imported. If a hardware send succeeds but saving state fails, Home sees a communication error and disk retains the previous state; inspect disk access/space before trying again. If a write is uncertain, the bridge cannot verify physical output; reconnection restores the last saved desired state.
