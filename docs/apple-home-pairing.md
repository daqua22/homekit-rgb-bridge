# Apple Home pairing

The maintainer verified virtual-light pairing and hardware-bridge pairing, including physical Corsair RAM color changes. New candidate installation/upgrade and other hardware behavior remain subject to the manual checklist. This is not Apple-certified software.

1. Keep the PC and iPhone/iPad on the same trusted LAN, with the PC awake. Permit HAP TCP and mDNS through your reviewed private-network firewall settings.
2. Configure intended lights in the local panel and start the bridge. A newly installed bridge with no selected lights can be configured before publishing.
3. Explicitly click **Reveal private pairing code & QR**. No setup code is included in the default dashboard, logs or launch arguments.
4. Apple Home → **+ → Add Accessory**. Scan the QR or use the displayed setup code. Accept an uncertified-accessory prompt if offered; UI wording varies by iOS.
5. Assign rooms and test each light. Hide the pairing information after use; switching away from the page also hides it.
6. Stop/start using the dashboard, then verify pairing persists. A stopped bridge displays unknown pairing status until started.

The old `start --pairing` CLI remains supported and explicitly prints private setup credentials. Never record that terminal, upload its QR, or share identity/HAP files. Credentials are unique per private data directory. Keep the exact directory and unchanged whole-device IDs across upgrades to retain pairings. Merely reading a legacy profile does not reset it or change its HomeKit port.

Opting into new zone/group lights creates new accessories while keeping existing whole-device UUID seeds unchanged. Replacing a whole-device light may require reassigning rooms/automations; preserving a bridge pairing does not preserve associations for removed accessories. No automatic identity remapping occurs.

## Deliberate reset

Use only when you intend to remove all pairings for this profile. First remove the bridge from Apple Home. In the local panel, expand Reset HomeKit pairing and type **RESET HOMEKIT PAIRING**. The app stops the bridge, creates a complete private backup, removes current identity/HAP storage, and requires Quit/reopen before generating fresh credentials. Configured selections and saved lighting states remain. This explicit reset is the only UI action that deliberately removes pairing keys.

Do not reset to troubleshoot a firewall/SDK problem. Protect backups because they contain usable old credentials. No PIN or QR should appear in screenshots used for support. Remote Siri/automations depend on Apple's home hub/network behavior and have not been tested here.
