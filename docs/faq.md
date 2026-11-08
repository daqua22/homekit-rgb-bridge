# FAQ

**Do users need npm or Node installed?** Portable Windows x64 users do not: the package includes a pinned official runtime and production dependencies. Source development and the thin Node preview still use npm/Node.

**Is this Homebridge or a cloud service?** No. V2 uses Electron for the desktop interface and a bundled official Node process for HAP-NodeJS. Everything runs locally; there are no accounts, analytics, cloud database or extra hardware requirements.

**Is there an EXE and a tray icon?** V2 prepares a Windows x64 EXE installer with shortcuts, tray controls and user-level sign-in startup. It is an unsigned experimental candidate until approved. No Windows service is installed; startup is after sign-in. The older portable VBS/browser package remains an advanced option. See [desktop setup](desktop-v2.md).

**What hardware has actually worked?** The maintainer verified physical Corsair Vengeance RGB DDR5 color changes through Apple Home. Hub, mouse and motherboard entries are discovery only. Brightness/off, zones/groups and physical recovery are unverified. See [matrix](hardware-compatibility.md).

**Why is RAM missing?** First check OpenRGB itself. Its current Windows SMBus path needs PawnIO and required administrator access. Close iCUE and other competing RGB software. The bridge does not probe RAM directly.

**Does off cut power?** No. It sends black, preserving desired color/brightness for on. Brightness scales RGB channels; zero brightness remains black even if desired on is true. No physical state sensor/readback is promised.

**Are zones independent?** Only eligible per-LED layouts can be opted into experimental zone lights. Other LED bytes are preserved in software, but firmware isolation must be tested. Zero-LED/ambiguous/global-only zones are disabled; listing multiple zones alone is insufficient.

**Can targets be grouped?** Yes, with no overlap between enabled standalone/group/whole/zone lights. A partial failure reports failed and accepted targets and does not claim group success. There is no automatic compensating rollback after uncertain writes.

**Will upgrading reset Apple Home?** Reading legacy files preserves identities/keys/UUID seeds/ports. Explicit saves and legacy state writes create private backups before format changes. Use the exact existing profile folder. Replacing a whole-device light with new zones/groups creates new accessories and may require room/automation reassignment.

**How do I reset pairing deliberately?** Remove the bridge from Home, use the exact reset confirmation in the UI, then Quit/reopen. Reset backs up first and retains selections/state. Do not reset keys to fix networking.

**How is the local panel protected?** Loopback-only binding, random bearer capability supplied through a private launch file, strict Host/Origin checks, no cookies/CORS, request limits and CSP. Pairing QR/PIN appears only after explicit action. Any process with access to your private profile can read local credentials, so protect NTFS permissions/backups.

**What if I close the desktop window?** V2 hides in the system tray and continues running. Click the tray or shortcut to reopen; use Quit application to stop it. The old browser panel also keeps running when its browser tab closes.

**Can it control hardware with the PC off?** No. The PC, bridge and OpenRGB must run. Sleep/wake/reboot behavior needs manual validation. Remote Siri/automations depend on Apple's home hub/network setup.

**Is the desktop release published?** Publication requires explicit maintainer approval. Review artifacts and notes are prepared; the GitHub workflow only builds, validates and uploads candidates.
