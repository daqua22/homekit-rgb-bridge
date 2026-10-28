# OpenRGB setup

Install OpenRGB separately using its [official project](https://openrgb.org/) instructions. Choose an up-to-date version appropriate for your hardware. The adapter requests **SDK protocol 3** and requires servers supporting that protocol or newer. Newer servers are asked for version-3 controller layouts, rather than parsed as newer formats. This backward-negotiation path is tested against a synthetic server, not every OpenRGB release.

1. Read OpenRGB's hardware warnings and compatibility information before detection. No custom drivers or bus probing are implemented by this bridge.
2. Stop other RGB applications, including Corsair iCUE, Armoury Crate, Mystic Light and other manufacturer utilities. They can contend for controllers or overwrite colors. This bridge has no iCUE integration.
3. In OpenRGB, detect your devices. Verify that each intended device can display a fixed color in a **Direct** mode. Do not enable unsupported controllers or resize zones solely for this project.
4. Open the SDK Server controls and start the server on TCP 6742. UI labels/settings vary across OpenRGB versions. Bind to `127.0.0.1`/loopback if your build permits it. Independently inspect the actual listener; do not assume localhost client configuration changes the server's binding:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 6742 | Select-Object LocalAddress, LocalPort
```

A listener on `0.0.0.0` or `::` accepts other interfaces. If OpenRGB cannot bind locally, use a carefully reviewed firewall rule to prevent remote SDK access. The bridge does not alter OpenRGB or firewall configuration. Do not forward this port through your router.

5. Initialize an OpenRGB configuration with `npm start -- init` (omit `--mock`). If a mock configuration exists, use a separate `--data-dir` consistently.
6. Run `npm start -- list`. It lists hashed persistent IDs, display metadata, zones and explicit capabilities. It does not switch modes or write colors. Stop any running bridge using this directory before listing.
7. Copy selected IDs into `devices` in config, choose safe HomeKit names, set `enabled: true`, run `check`, then `start`. Starting applies saved states; a newly selected device receives black.

Only Direct modes with OpenRGB's per-LED-color capability and matching nonzero LED/color counts are controlled. The bridge selects the advertised Direct mode, sets its mode brightness to maximum, selects per-LED colors and sends one RGB value to every LED. It does not invoke persistent hardware SaveMode, resize zones or manipulate driver settings. Existing lighting effects are replaced while you use the bridge; previous manufacturer modes are not restored on exit.

Power and brightness are software approximations. A TCP write completing means the packet was handed to the local transport, not that hardware displayed the requested value. Protocol 3 provides no hardware acknowledgment. Errors/readback from the physical device cannot be inferred from a successful socket write.

On connection failure the bridge marks configured lights unavailable, retries with bounded exponential backoff and re-enumerates. It restores the last transport-accepted desired state on reconnect/reappearance. A device-list change notification closes the connection to avoid stale numeric indices. Polling also refreshes inventory. Moving a controller to a different port can change a location-based ID when it has no serial; explicitly update configuration only after confirming the device.
