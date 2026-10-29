# Security policy

This is an experimental v0.1.0 candidate. No stable-support or response-time SLA is promised. Security fixes target the maintained source branch. Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/daqua22/homekit-rgb-bridge/security/advisories/new); if unavailable, use the private contact route at [kozar.dev](https://kozar.dev). Do not post credentials or exploit details in public Issues.

## Administrative interface

The control panel binds only `127.0.0.1`. Every API requires a random 256-bit bearer credential; there are no authenticated cookies or anonymous configuration APIs. Exact Host/Origin validation, cross-site rejection, no CORS permission, bounded JSON bodies, rate/time/header limits, an asset allowlist, CSP/frame restrictions, no-store and no-referrer headers address browser-origin/DNS-rebinding risks.

A private `admin-session.json` and `open-control.html` handoff in the profile allow reopening the running panel. The launch token goes in a URL fragment, is immediately removed from the URL, and is kept in tab session storage. It is never put in process arguments, ordinary logs, Git or package artifacts. An authenticated local UI can view the profile path/config and request pairing information; do not share the screen or handoff files. Any process running as the same Windows user can access this unencrypted local data; this is not isolation from a compromised account, malicious local browser extensions or administrators.

QR/PIN reveal requires explicit user action. It is absent from status/log responses and hidden when the page loses visibility. Deliberate pairing reset requires an exact phrase, stops the bridge and backs up before deleting identity/HAP storage; a new process is required afterward. Configuration Save requires explicit consent and the loaded file revision. Browser requests are schema-validated and dynamic values are rendered as text, not HTML. No endpoint reads arbitrary files or accepts an arbitrary shell command/path.

## Hardware and network boundary

OpenRGB is separately installed and exposes an unauthenticated SDK. The bridge accepts loopback hosts only, but cannot restrict OpenRGB's own server listener. Independently inspect it; never expose TCP 6742 to untrusted networks or the internet. Use current upstream PawnIO/OpenRGB instructions for RAM; this app does not install drivers, disable security settings, probe buses or alter firmware, persistent RGB profiles, fan or pump controls.

HAP-NodeJS owns authenticated pairing/encryption. No insecure HAP override is enabled. HAP uses TCP 51826 by default (or a preserved/user-selected port), plus mDNS UDP 5353 on the trusted LAN. HAP interface binding is not a firewall substitute. No automatic Windows Firewall changes occur. PC-off/asleep operation is not possible. This is not an Apple-certified accessory.

The independent protocol parser limits frames/counts, validates fields and times out requests/writes. It rejects unsupported versions and ambiguous identities; notifications invalidate index-based routing. It does not infer hardware acknowledgment or safe physical zone isolation from mere enumeration. Group failures are explicit and may leave partial output; uncertain writes are not automatically rolled back.

## Private storage, upgrades and locks

Profiles contain setup credentials, long-term HAP keys, pairing data, desired states and backups. They are not encrypted at rest. Keep them outside Git, the application directory, cloud-shared/public folders and release artifacts. POSIX creation uses 0700/0600 and a restrictive umask. Windows requires reviewed NTFS ACLs: inspect folder Properties → Security or `icacls` privately, retaining your account and necessary SYSTEM/administrator access. POSIX mode bits do not establish Windows ACL protection.

Legacy config/state load without disk changes. Confirmed config saves and first legacy state-format writes back up privately before replacements. Backup failure aborts a save. Files use atomic replacement but do not guarantee power-loss durability or a hardware+disk transaction. Future versions fail validation. Identity files/HAP keys are only reset by a deliberate reset action.

A heartbeat directory lock protects new processes; a PID marker maintains old-CLI exclusion. Abandoned lock recovery waits for staleness. Live/permission-ambiguous legacy PIDs are not stolen; PID reuse may require inspection. Never remove a lock while its process might run. Forced termination cannot perform cleanup, unlike API Quit.

## Distribution and diagnostics

The Windows portable package runs as the user and needs no installer elevation. Its Node executable is downloaded from a pinned official HTTPS URL and SHA-256, left unmodified, and distributed with the complete runtime license and provenance. Locked production dependencies/notices are included; development tools, profiles, logs, backups and credentials are excluded. Packaging is verified on Windows before review. No certificate purchase or project signing is claimed; SmartScreen/Script Host warnings may occur. Do not disable security policy to run it.

User-level autostart writes only this profile's identified Startup VBS file. Paths are quoted/validated; it embeds no pairing/admin credentials. An unrelated startup file is not overwritten. Moving an installation requires updating startup through an explicit UI action. Windows desktop sign-in/reboot/sleep and ACL behavior remain manual checks.

Default diagnostics contain only fixed events; file rotation is bounded. Third-party DEBUG output may contain private data and should remain disabled. Browser test traces/videos and setup screenshots are not published. CI uses pinned actions/read-only content permissions and no release credentials on pull requests. Runtime dependency auditing/license review is automated; the separately bundled Node runtime must also be reviewed/updated when security releases require it. No automatic package/Release publication is configured.
