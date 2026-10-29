# Manual verification matrix

Record the exact candidate commit, Windows build, runtime version, OpenRGB version, iOS version and manufacturer/model/firmware. Never attach raw serials, private paths, setup PINs/QRs, admin tokens or HAP files.

**Maintainer-reported baseline:** Windows dependencies/build/lint/original 43 tests passed; virtual-light pairing, physical SDK discovery, hardware-bridge pairing and Corsair Vengeance RGB DDR5 physical color changes worked. OpenRGB 1.1 / SDK 6 / API 5 / Qt 6.8.3 reported. The old hardware profile used HAP port 51827 alongside mock port 51826; those are local choices.

These baseline results do not automatically verify the new candidate's UI, groups, zones, installer experience or lifecycle. Keep new candidate checks pending until observed.

| Check                               | Procedure / expected evidence                                                                          | Status                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Baseline virtual Apple Home pairing | Original virtual light added to Apple Home; color commands accepted                                    | Maintainer verified                                              |
| Baseline hardware discovery/pairing | OpenRGB SDK enumerated listed hardware; hardware bridge paired                                         | Maintainer verified                                              |
| Baseline Corsair RAM color          | Apple Home color changes visibly changed two Corsair DDR5 modules                                      | Maintainer verified                                              |
| Fresh Windows 10/11 x64 install     | Verify checksum, extract full portable ZIP, launch with no installed Node/npm, configure through UI    | Pending physical desktop check; packaged runtime smoke in CI     |
| Existing-installation upgrade       | Back up old profile, select exact folder, keep IDs/port/keys; verify Home rooms/pairing/state          | Automated regression exists; physical upgrade pending            |
| Candidate Apple Home pairing        | Reveal privately, scan/add, assign rooms, hide QR, restart without re-pair                             | Pending candidate-specific test                                  |
| Device enable/rename                | Select multiple controllers, save/backup, verify intended lights and unchanged UUIDs                   | Browser/synthetic coverage; physical pending                     |
| Color / brightness                  | RGB primaries, white/grayscale and 0/25/50/100%; note nonlinearities                                   | Candidate physical pending; only baseline RAM color verified     |
| Software on/off                     | Off sends black; on restores color/brightness; no electrical-power claim                               | Physical pending                                                 |
| Independent zones                   | Safely opt in; vary each fan/cooler/mouse zone while checking all others remain unchanged              | Physical pending; synthetic byte isolation verified              |
| Empty/unsupported zones             | Zero-LED motherboard zones disabled; unsupported layout refused                                        | Automated coverage; physical pending                             |
| Groups                              | Change group; disconnect one member and inspect accepted/failed diagnostics                            | Automated failure coverage; physical pending                     |
| OpenRGB restart                     | Stop/restart SDK while bridge runs; unavailable status then rediscovery/saved restoration              | Automated coverage; physical pending                             |
| Multiple-device reorder             | Safely reorder/hotplug supported hardware; identities stay with devices                                | Synthetic coverage; physical pending                             |
| Windows startup/restart             | Enable per-user startup, quit/reboot/sign in; OpenRGB/bridge recover without console                   | Hidden launch smoke in CI; physical login/reboot pending         |
| Sleep/wake and network loss         | Sleep/wake PC, interrupt network and restore; Home and SDK recover                                     | Physical pending                                                 |
| Application crash                   | Force only the test bridge to exit; wait for stale-lock recovery, relaunch exact profile               | Lock regression exists; physical Windows crash pending           |
| Reset protection                    | Reject wrong confirmation; back up before deliberate reset; require new process; config/state retained | API confirmation coverage; physical Home removal/re-pair pending |
| Permissions/privacy                 | Inspect NTFS ACLs, protected local API, hidden QR/PIN, private backups and fixed logs                  | Automated API/privacy coverage; physical ACL review pending      |
| Uninstall                           | Disable startup, quit, remove app files; private profile remains; no unrelated software removed        | Procedure documented; physical pending                           |

Do not combine partial results into a blanket compatibility claim. For each physical result record pass/fail, exact observation and known problems. A successful TCP write or unchanged synthetic byte range is not proof of physical output.
