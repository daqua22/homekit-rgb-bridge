# Development

Use a full source checkout, Node 24 (see `.nvmrc`) and npm. The CLI also accepts Node 22.15+ and 26; CI covers 24/26 on Windows/Linux. Install with `npm ci`; commit lockfile changes deliberately.

```powershell
npm ci
npm run check
npm run format:check
npm run smoke
npm run licenses
npm run package:preview
npm run package:verify
```

`check`: ESLint → strict TypeScript check → Vitest → build. `smoke`: real HAP TCP endpoint requiring authentication, default-output credential checks, HAP file persistence and graceful restart on POSIX. On Windows the smoke stops after listener verification because Node's `child.kill()` is forced termination there. Real Ctrl+C/Task Scheduler reboot behavior remains manual.

`package:preview` needs a successful build and notices first. It stages an explicit allowlist into a Windows Node `.tar.gz` archive and writes SHA256SUMS. `package:verify` checks its checksum/content, extracts to a fresh temporary directory, installs runtime dependencies with the lockfile and exercises help/init/check/mock list. It requires `tar`, available on current supported Windows 10/11 systems and Linux/macOS. No release upload occurs.

`licenses` verifies an allowlist of reviewed license identifiers across all lockfile packages, rejects unknown licenses, inventories runtime packages and retains their license/notice text. Regenerated notices are committed. New dependency licenses require human review; the allowlist is not a substitute for reading additional terms.

## Structure

```text
src/adapters/    adapter boundary, mock and bounded OpenRGB TCP implementation
src/homekit/    HAP bridge and light characteristic handlers
src/devices/    desired state, serialized commands and reconnect loop
src/config/     schema, private paths, identity, lock and state store
src/utils/      HSV/RGB math and fixed-event logger
src/index.ts    CLI composition and shutdown
scripts/        smoke, notices, packaging and archive verification
examples/       safe mock/hardware configurations without credentials
tests/          conversion, config, manager, HAP handlers and synthetic SDK TCP tests
.github/        least-privilege CI and contribution forms
docs/           operation, design, evidence and release process
```

For local mock development, use `npm run dev -- init --mock --data-dir <private-dir>` and `npm run dev -- start --data-dir <same-dir>`. Do not initialize inside the checkout. HAP storage is process-global; tests that publish independent bridges should use separate Node processes. Protocol fixtures are synthetic, not imported OpenRGB code or hardware captures.

Adapters must never pretend to confirm hardware output. Reject invalid data, report capabilities, preserve stable identity and invalidate stale device routing. Add meaningful behavior tests for the change rather than implementation-mirroring assertions. Keep network operations serialized and shutdown bounded. Do not add custom bus/USB drivers, telemetry or iCUE support in V1.

CI installs from the lockfile, validates formatting/lint/types/tests/build, reviews licenses, checks runtime audit and verifies preview packaging. It uploads CI artifacts only on manually dispatched runs requesting them. No workflow can publish an npm package, GitHub Release or tag. See [release gates](releases.md) before distribution.
