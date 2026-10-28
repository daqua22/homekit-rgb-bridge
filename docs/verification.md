# Validation evidence and limits

Initial implementation validation uses synthetic inputs and the mock adapter. Check the exact commit's [GitHub Actions run](https://github.com/daqua22/homekit-rgb-bridge/actions/workflows/ci.yml) for platform-specific results; a badge is not proof of hardware support.

Automated coverage:

- HSV/RGB conversions including black, white, grayscale, hue endpoints, brightness scaling, invalid values and a 4096-color round-trip grid.
- Valid/invalid configuration, unknown fields, duplicate IDs, local-host restriction, persistent identity/state and per-directory locking.
- Serialized HomeKit state changes, mock commands, capability checks, write failures, disappearance/reappearance and reconnect backoff.
- Real HAP-NodeJS characteristic handlers translate Home commands and return unavailable status appropriately.
- Synthetic TCP OpenRGB server exercises version negotiation, fragmented responses, controller parsing/zones, exact color packet encoding, index reordering, ambiguous IDs, inventory invalidation, timeouts and reconnects.
- Runtime smoke creates a real local HAP listener, checks `/accessories` rejects unauthenticated access with HTTP 470 and checks default output omits pairing credentials. POSIX runs additionally check graceful restart and persisted HAP files. No insecure HAP access is enabled.
- Preview archive checks validate SHA-256 and allowed contents, install runtime dependencies into a fresh extracted directory and run help/init/check/mock discovery.
- Dependency license inventory and npm audit of runtime dependencies.

Not established by these tests: physical Apple Home pairing; iOS discovery from another host; actual RGB output; compatibility with a particular controller/OpenRGB build; Windows sign-in task, forced shutdown or reboot behavior; physical multi-device hotplug and network sleep recovery; remote Siri/automations. [All manual checklist items](manual-verification.md) remain pending until real evidence is added.

No verified physical screenshots are available. None are fabricated or substituted with mock images. The project has no verified hardware support table entries and no tagged release. Initial archives are engineering previews that require Node, not standalone Windows applications.
