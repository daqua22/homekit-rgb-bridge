# FAQ

**Is this Homebridge?** No. It uses the HAP-NodeJS library directly and runs as one Node.js CLI on the PC.

**Do I need extra hardware or a cloud account?** No. Normal control is local between Apple Home, this bridge and OpenRGB on the PC. Apple remote access may need Apple's home hub configuration; that is outside this project's verified scope.

**Is it an executable, installer or Windows service?** No. It needs Node.js and separately installed OpenRGB. Task Scheduler can start the Node process after sign-in. Native packaging and service operation are future work.

**Is it certified by Apple?** No. Neither this bridge nor the HAP implementation is an Apple-certified accessory.

**What hardware is verified?** No physical models yet. Automated tests cover a virtual light and synthetic OpenRGB protocol controllers. See [the evidence table](hardware-compatibility.md).

**Does Corsair work?** Only if your exact hardware is supported by OpenRGB and meets this adapter's Direct-mode checks. There is no native iCUE adapter. OpenRGB and manufacturer software can conflict; do not run them together during validation.

**What do on/off and brightness mean?** Off sends RGB black; on restores the saved desired color/brightness. Brightness scales RGB values. Neither controls electrical power or measures actual light output. Brightness zero is black even when desired `on` remains true.

**Can I set zones or individual LEDs in Home?** No. The inventory lists zones, but V1 exposes one uniform light per controller. No effects or per-zone accessories are supported.

**Does it restore state?** It restores its last successfully saved transport-accepted desired state on restart/reconnect, including software off. It does not read manufacturer effects or import external RGB changes. Physical write acknowledgment is unavailable in the chosen protocol subset.

**Can the PC sleep?** Home will lose access while the bridge or PC is offline/asleep. It cannot wake or power the PC. Windows reboot/autostart needs validation on your own machine.

**Why no hardcoded setup PIN?** Credentials are randomly generated per private data directory. `--pairing` prints them only when explicitly requested. Preserve the directory to retain pairings and protect its backups.

**Can I use a remote OpenRGB server?** V1 permits only loopback addresses. Its SDK server is unauthenticated; never expose it to the internet.

**Why did moving my controller change its ID?** When a serial is absent, identity falls back to location. Moving ports can change location. Confirm the exact hardware before updating config. Indistinguishable duplicate controllers are rejected.

**Where are screenshots/downloads?** No physical-device screenshot or release claim is fabricated. Build a preview archive or inspect CI results. A release will be published only after the documented preview gates pass.
