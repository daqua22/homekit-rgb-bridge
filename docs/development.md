# Development

Use Node 24 (see `.nvmrc`) and `npm ci`. Source scripts also support Node 22.15+ and 26; CI covers Windows/Linux with 24/26. Preserve the lockfile and review dependency/runtime licenses and vulnerabilities on changes.

```powershell
npm ci
npx playwright install chromium
npm run check
npm run format:check
npm run smoke
npm run test:browser
npm run licenses
npm run package:preview
npm run package:verify
# Windows x64:
npm run package:windows
npm run verify:windows
```

`check` runs ESLint, strict TypeScript, Vitest and the production build. `smoke` exercises a real HAP listener requiring authentication and default-output privacy; POSIX additionally checks signal shutdown/restart. Physical pairing is a separate maintainer report. `test:browser` walks Chromium → authenticated API → config/state → mock adapter → rendered UI, with private QR reveal/hide, identity-preserving restart, keyboard access and narrow layout checks. It captures mock-mode UI media only after hiding credentials. Test traces/videos are disabled to avoid recording private setup information.

The thin `package:preview` requires separately installed Node/npm at runtime. The Windows-only `package:windows` downloads the official Node ZIP pinned by `distribution-runtime.json`, verifies SHA-256, retains its license, installs only locked production dependencies into a staging directory and produces a portable ZIP/checksum. `verify:windows` extracts it, uses the **bundled** runtime without npm, starts a real mock HAP bridge, exercises private APIs/light state, checks restart identity preservation and clean lock removal, and runs a hidden VBS startup launcher via Windows Script Host. It does not certify actual desktop sign-in, Windows reboot, hardware output or SmartScreen behavior.

## Structure

```text
src/adapters/   independently implemented OpenRGB TCP subset + mock backend
src/homekit/   bridge, stable UUIDs, HAP characteristics
src/devices/   target/group mapping, coalescing, serialized writes and reconnect
src/config/    versioned schema/state, backups, identity and heartbeat/legacy lock
src/app/       local HTTP security, controller lifecycle and launch handoff
src/windows/   scoped per-user Startup launcher generation
public/        accessible vanilla browser UI (no cloud or framework runtime)
scripts/       smoke, notices, thin/portable package generation and verification
tests/         unit/integration/TCP security and release regression coverage
tests/e2e/     Playwright browser flow against an isolated private profile
```

For local operation run `npm run app`, or `npm start -- app --open --data-dir <private-profile>`. Do not initialize inside the checkout or use a live hardware profile in tests. HAP storage is process-global; separate profile tests that publish bridges use separate processes. Synthetic SDK fixtures are not hardware captures or copied OpenRGB implementation.

## Change discipline

Preserve legacy UUID seeds, device IDs, identity.json, HAP paths and user-selected ports. Add a regression before changing their formats. Migrations read in memory and back up before an explicitly confirmed config save; never silently reset a failed load. Future schema versions fail closed. New zones/groups get new stable IDs; replacing whole-device lights has an explicit Home association impact.

Keep adapters free of HAP/UI concerns. Never infer physical acknowledgment from a socket write. Require capability/layout checks, reject overlapping targets, preserve other LED ranges, serialize commands and report partial group failures. No SMBus/USB/fan/pump/firmware APIs belong here. Browser changes need keyboard/contrast/scaling checks and safe text-only dynamic rendering.

CI uses immutable action SHAs and read-only repository permissions. It audits runtime dependencies, checks generated notices, tests browser flow, builds/validates Windows packaging and uploads review artifacts. The manual release-candidate workflow also only builds/validates/uploads notes/artifacts. Neither workflow can publish a Release or package. See [releases](releases.md) for approval gates.
