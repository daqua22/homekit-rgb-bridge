# FAQ

**Do users need npm or Node installed?** Portable Windows x64 users do not: the package includes a pinned official runtime and production dependencies. Source development and the thin Node preview still use npm/Node.

**Is this Homebridge, Electron or a cloud service?** No. HAP-NodeJS runs directly on the PC. The lightweight browser configuration UI is served only on loopback; no accounts, analytics, cloud database or extra hardware are required.

**Is it a native EXE, installer, tray app or Windows service?** No. It is a portable application folder with node.exe, JavaScript/dependencies and a hidden VBS launcher. Startup is user-level at sign-in, not before login. Script Host must be permitted.

**What hardware has actually worked?** The maintainer verified physical Corsair Vengeance RGB DDR5 color changes through Apple Home. Hub, mouse and motherboard entries are discovery only. Brightness/off, zones/groups and physical recovery are unverified. See [matrix](hardware-compatibility.md).

**Why is RAM missing?** First check OpenRGB itself. Its current Windows SMBus path needs PawnIO and required administrator access. Close iCUE and other competing RGB software. The bridge does not probe RAM directly.

**Does off cut power?** No. It sends black, preserving desired color/brightness for on. Brightness scales RGB channels; zero brightness remains black even if desired on is true. No physical state sensor/readback is promised.

**Are zones independent?** Only eligible per-LED layouts can be opted into experimental zone lights. Other LED bytes are preserved in software, but firmware isolation must be tested. Zero-LED/ambiguous/global-only zones are disabled; listing multiple zones alone is insufficient.

**Can targets be grouped?** Yes, with no overlap between enabled standalone/group/whole/zone lights. A partial failure reports failed and accepted targets and does not claim group success. There is no automatic compensating rollback after uncertain writes.

**Will upgrading reset Apple Home?** Reading legacy files preserves identities/keys/UUID seeds/ports. Explicit saves and legacy state writes create private backups before format changes. Use the exact existing profile folder. Replacing a whole-device light with new zones/groups creates new accessories and may require room/automation reassignment.

**How do I reset pairing deliberately?** Remove the bridge from Home, use the exact reset confirmation in the UI, then Quit/reopen. Reset backs up first and retains selections/state. Do not reset keys to fix networking.

**How is the local panel protected?** Loopback-only binding, random bearer capability supplied through a private launch file, strict Host/Origin checks, no cookies/CORS, request limits and CSP. Pairing QR/PIN appears only after explicit action. Any process with access to your private profile can read local credentials, so protect NTFS permissions/backups.

**What if I close the browser?** The bridge continues. Reopen the launcher with the same profile. Use Quit application for a graceful exit; enable sign-in startup only after validating your setup.

**Can it control hardware with the PC off?** No. The PC, bridge and OpenRGB must run. Sleep/wake/reboot behavior needs manual validation. Remote Siri/automations depend on Apple's home hub/network setup.

**Is v0.1.0 published?** Not by this work without explicit maintainer approval. Review artifacts and notes are prepared; the GitHub workflow only builds, validates and uploads candidates.
