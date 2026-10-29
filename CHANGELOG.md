# Changelog

## 0.1.0 — Experimental release candidate (unreleased)

- Fix the portable launcher’s file-to-browser navigation being rejected as cross-site; retain strict API/Host/Origin checks and cover the actual private handoff in browser tests.
- Add a protected local browser configuration panel with dashboard, discovery/selection/naming, groups, bridge lifecycle, explicit pairing reveal/reset and diagnostics.
- Add opt-in experimental zones using validated per-LED ranges, stable zone identities, preserved unrelated color bytes and zero/ambiguous/global-only rejection.
- Add logical group failure reporting and 35 ms slider coalescing with final desired-state preservation.
- Preserve legacy whole-device identity/HAP storage/user ports and add backed-up versioned config/state migration.
- Add recoverable heartbeat locking and hidden user-level Windows Startup launchers.
- Prepare a Windows x64 portable package with a checksum-pinned official Node runtime, production dependencies, license retention and extracted-runtime/background-launch smoke checks.
- Expand unit/integration/security/browser/regression/packaging verification and read-only CI review artifacts.
- Record maintainer-verified virtual/hardware pairing and Corsair Vengeance RGB DDR5 physical color control; other discovered controllers and physical zone/group/brightness/off/recovery remain unverified.

No tag or GitHub Release is published without explicit maintainer approval. See draft notes and manual gates.

## 0.1.0-dev.0 — Initial public prototype

- Standalone HAP-NodeJS bridge, mock backend and bounded OpenRGB protocol-3 adapter.
- Private per-install credentials, desired-state persistence, stable IDs and reconnect handling.
- Original 43 automated tests, Windows/Linux CI, thin Node preview packaging and public contribution process.
