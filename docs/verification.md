# Verification evidence

## Evidence boundaries

The maintainer reports the original Windows CLI working: dependency install, build/lint/43 tests, virtual Apple Home pairing, physical OpenRGB discovery, hardware-bridge pairing and physical Corsair Vengeance RGB DDR5 color control. Other discovered devices and brightness/on/off/zones/recovery remain physically unverified. See [hardware compatibility](hardware-compatibility.md).

The baseline before this change is recorded in [release-baseline.md](release-baseline.md). New automated checks use synthetic inputs and isolated private profiles; they never touch the maintainer's installation. The exact commit's [GitHub CI](https://github.com/daqua22/homekit-rgb-bridge/actions) establishes platform-specific results, not physical compatibility.

## Automated scope

- Original RGB/HSV edge cases and 4096-color round-trip grid; software power/brightness semantics.
- Legacy config/state loading without mutation, backed-up versioned saves, future-version refusal, unchanged whole UUIDs/identity/HAP files and port preservation.
- Serialized device/zone/group commands, coalescing final state, zero-LED/ambiguous/global-only zone rejection, byte preservation and partial group failure reporting.
- Actual HAP characteristic handlers, offline status and a real authenticated HAP listener; local advertisement completion is awaited, not assumed from a port alone.
- Synthetic SDK version negotiation (including a server advertising 6 receiving protocol-3 requests), fragmentation, index reorder, inventory invalidation, timeouts, malformed layouts and reconnect.
- Heartbeat stale-lock recovery and live legacy PID refusal; user-scoped Windows Startup launcher generation.
- Local admin bearer authentication, same-origin restrictions, asset allowlist, CSP/no-store, request validation/body limits, explicit save/reset consent and dashboard credential exclusion.
- Chromium → protected API → config/state → mock adapter → UI, private pairing reveal/hide, identity-preserving stop/start, responsive width and keyboard focus. The captured screenshot is actual mock-mode UI, not a hardware demonstration.
- Thin archive checksums/allowlist/extracted dependency install and CLI checks.
- Windows x64 portable archive: official runtime checksum, bundled Node execution, extracted application startup/API/mock light, identity-preserving restart, graceful quit/lock release and hidden VBS launch. No system npm is used to operate that extracted package.
- Locked dependency license review, retained notices and npm runtime audit. Node runtime provenance/license is retained separately.

The verification skill's full-story flow is applied to the control panel: browser action → authenticated request → controller/schema → backup/config/state or adapter → response → rendered UI. Browser errors and first broken boundaries are fixed before continuing. No environment secrets or cloud services are required.

## Remaining manual scope

Fresh Windows 10/11 desktop installation, actual existing-profile upgrade, SmartScreen/Script Host policy, NTFS access review, sign-in/logout/reboot/sleep/wake, physical zone/group isolation, other controllers and candidate-specific Apple Home checks remain manual. All pending items are listed in [manual-verification.md](manual-verification.md). Do not call the release complete merely because CI passes.
