# Hardware compatibility and evidence

Compatibility depends on exact controller, firmware, motherboard and OpenRGB version. OpenRGB detection alone does not prove light control. The maintainer supplied the following observations during initial Windows testing; exact Windows build, firmware and motherboard/SMBus access details beyond those below were not supplied. No raw device serials or private stable hashes are published.

| Hardware                                           | Discovered layout                                              | Evidence / status                                                                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Corsair Vengeance RGB DDR5, CMH32GX5M2E6000C36 kit | Two modules, 10 LEDs each                                      | **Physical color control verified by project maintainer** through the hardware bridge paired with Apple Home. OpenRGB 1.1 / SDK 6 / API 5 / Qt 6.8.3 reported. |
| Corsair iCUE LINK System Hub                       | Three 8-LED RX RGB fan zones; one 20-LED TITAN 360 cooler zone | Discovered by SDK; physical control and independent-zone isolation unverified.                                                                                 |
| Logitech G Pro Wireless                            | Two lighting zones                                             | Discovered by SDK; physical control and zone isolation unverified.                                                                                             |
| Gigabyte B650 AORUS ELITE AX ICE                   | Two populated 1-LED zones; two zero-LED zones                  | Discovered by SDK; physical control unverified. Empty zones must remain disabled.                                                                              |
| Virtual mock light / synthetic controllers         | Automated fixtures                                             | Software testing only; no physical hardware claim.                                                                                                             |

**Only Corsair RAM color control and reported HomeKit pairing are hardware-verified here.** Brightness, software on/off, zone isolation, groups, reconnect, Windows reboot/sleep/wake and other devices remain physically unverified. The new release-candidate UI/distribution still needs an upgrade/fresh-desktop check even though prior bridge color control worked. Do not promote other rows based on CI or device enumeration.

The bridge reports software brightness and software black-as-off, never native power. Experimental zone eligibility requires a per-LED Direct mode, no entire-device-only flag, unique zone names and a complete LED partition. It does not certify firmware behavior. Zone packets preserve other LED ranges in software; physically validate before relying on isolation. Do not run iCUE or other manufacturer RGB writers simultaneously.

## Reporting process

Use the [hardware issue form](https://github.com/daqua22/homekit-rgb-bridge/issues/new?template=hardware.yml). Include manufacturer, exact model/firmware, OpenRGB version, Windows build, Node/bundled-runtime version and bridge commit/version. Specify which features were actually observed: discovery, color, software off/on, brightness, pairing/restart, zones, groups and reconnect. Include known problems and competing software.

Statuses are **maintainer-verified**, **community-reported** or **untested**. A reporter selecting “maintainer-verified” does not establish independent evidence; link reviewed checklist results. Add test date, exact environment and evidence link when available. Negative reports remain useful. Re-test after OpenRGB/firmware changes. Never attach setup PINs, QR codes, HAP files, raw serials or full private paths.

Use [manual-verification.md](manual-verification.md); no checks outside the observed feature should be inferred from a successful color change.
