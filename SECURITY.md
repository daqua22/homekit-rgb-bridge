# Security policy

This experimental project has no stable supported release yet. Security fixes target `main`; evaluate an update before using it on your trusted network.

Use [GitHub private vulnerability reporting](https://github.com/daqua22/homekit-rgb-bridge/security/advisories/new) if enabled. Otherwise use the private contact route at [kozar.dev](https://kozar.dev), naming the repository. Do not publish exploit details or credentials in Issues. Include affected version, redacted reproduction steps and impact. No response-time SLA is promised.

## Local trust boundary

- OpenRGB uses an unauthenticated TCP SDK. The bridge accepts only loopback hosts (`127.0.0.1`, `localhost`, `::1`). Independently verify the OpenRGB server's binding: the bridge cannot restrict the server's listener. Do not expose TCP 6742 to the internet or an untrusted LAN.
- HAP uses HAP-NodeJS authenticated pairing. No insecure-access override is enabled. HAP listens on TCP 51826 by default and advertises via multicast UDP 5353. Limit inbound access to a trusted Private network in Windows Firewall; no automatic firewall changes are made.
- The per-user data directory contains setup credentials, long-term HAP keys, pairing identities and desired light states. It is not encrypted at rest. Keep it outside the checkout and cloud-shared folders, with access limited to the running Windows user. Protect backups equally.
- POSIX directories/files use 0700/0600 creation permissions and restrictive process umask. Windows requires NTFS ACLs; POSIX mode bits do not guarantee Windows access restrictions. Inspect `icacls "$env:LOCALAPPDATA\HomeKitRGBBridge"` and use folder Properties → Security to remove unwanted access while retaining your account and needed administrators/SYSTEM. The application does not modify ACLs automatically.
- `--pairing` intentionally prints a setup code and QR to the local terminal. Do not redirect it into logs, screenshots or scheduled jobs. Default structured logs omit credentials/configuration. Third-party debug output may contain private data: leave `DEBUG` unset and redact before sharing.
- Only one bridge/list command can own a data directory at once. A stale `bridge.lock` after a crash requires manual removal after checking no bridge process is running.

This is not Apple-certified software. Do not use it for safety-critical lighting. OpenRGB hardware detection and drivers are supplied separately; consult its own security and hardware documentation, keep it updated and disable conflicting RGB applications.
