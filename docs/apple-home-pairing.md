# Apple Home pairing

Physical Apple Home pairing is **unverified** for this project. HAP-NodeJS handlers and an authenticated local HAP endpoint are tested in software. This is not an Apple-certified accessory.

1. Put your PC and iPhone/iPad on the same trusted local network. Disable guest-network isolation; allow mDNS and the configured HAP TCP port. Ensure the PC stays awake.
2. Initialize mock or hardware configuration and enable the intended devices.
3. In a private, interactive terminal run `npm start -- start --pairing`. With an override directory append `--data-dir "C:\your\private\directory"`.
4. Apple Home → **+ → Add Accessory**. Scan the terminal QR. Alternatively choose the available option for adding without a scan and enter the displayed eight-digit setup code. UI wording varies with iOS.
5. If offered, acknowledge that the bridge is uncertified. Assign the discovered lights to rooms and test each separately.
6. Stop with Ctrl+C, then restart with `npm start`. Confirm Home retains the pairing and desired controls.

The bridge generates a random code, setup ID and local accessory identity for each data directory. HAP-NodeJS owns its long-term cryptographic keys and paired-controller data. Those files persist under `hap-storage` in the same private directory. No universal code is supplied. `--pairing` intentionally reveals credentials in the terminal; ordinary startup does not print them.

Keep the same directory, Windows account and device IDs across restarts/upgrades. A renamed accessory keeps its UUID. Enabling/disabling configured devices requires a bridge restart; removing a device may remove its Apple Home room/automation associations. Two separate data directories create separate bridges.

If discovery fails, see [troubleshooting](troubleshooting.md). Do not erase pairing storage to fix a network problem. A deliberate factory reset requires removing the bridge from Apple Home, stopping all bridge processes, privately backing up data, then using a **new** empty data directory and pairing again. Old backups contain live credentials and must remain private.

Pairing to one Home does not automatically grant another Home access. Siri remote control and automations depend on Apple's home hub and network behavior; this project has not verified those features.
