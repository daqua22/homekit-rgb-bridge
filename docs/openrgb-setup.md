# OpenRGB setup

Install OpenRGB separately from its [official project](https://openrgb.org/). The maintainer used OpenRGB 1.1 (SDK 6, API 5) to discover hardware and control Corsair RAM through the bridge. The adapter negotiates **client protocol 3**, explicitly requests version-3 layouts and rejects servers below 3. Newer-server backward negotiation is covered by synthetic tests; no universal release/device compatibility is promised.

## RAM and Windows SMBus

OpenRGB must detect hardware before the bridge can expose it. RGB RAM uses SMBus access. Current [OpenRGB Windows instructions](https://gitlab.com/CalcProgrammer1/OpenRGB/-/blob/master/Documentation/SMBusAccess.md) require installing [PawnIO's signed Official edition](https://pawnio.eu/) and running OpenRGB with administrator access. The bridge itself should run as your ordinary user and never performs SMBus operations. Do not disable Windows security features or install old WinRing0/InpOut32 drivers for this project.

Close Corsair iCUE, Armoury Crate, Mystic Light and other manufacturer RGB tools. Concurrent hardware writers can block discovery or overwrite colors. If RAM is missing, inspect OpenRGB's I2C/SMBus/PawnIO warning before changing bridge configuration. Identify RAM without serials using:

```powershell
Get-CimInstance Win32_PhysicalMemory | Select-Object Manufacturer, PartNumber
```

OpenRGB hardware detection, drivers and their limitations are outside this bridge. No fan/pump control, firmware modifications, profile save or zone resize is performed.

## Local SDK and selection

1. Verify intended devices appear in OpenRGB and expose a usable per-LED Direct mode.
2. Start SDK Server on TCP 6742 or your chosen local port. Bind it to loopback if supported by your build. Independently inspect the listener:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 6742 | Select-Object LocalAddress, LocalPort
```

`0.0.0.0` / `::` indicates a wildcard listener; local client configuration does not change the server's binding. Restrict access with a reviewed firewall configuration if necessary. Never forward the SDK port through your router.

3. In the bridge panel, select OpenRGB and the matching loopback host/port. Confirm/save, discover, select devices and name them. Confirm/save again and start.
4. Whole controllers are the conservative default. Starting applies saved desired states; new lights receive black. Direct mode replaces existing lighting effects, which are not restored on exit.

## Experimental zones

The SDK exposes UpdateZoneLEDs, but the protocol does not guarantee that every controller implements independent physical zone updates. This bridge instead serializes full per-LED buffers, replacing only the selected zone's validated range and preserving other ranges. It requires a per-LED Direct mode without the entire-device-only flag, a complete LED partition and unique zone names; zero-LED zones are disabled. No range is guessed. Explicit experimental consent is required.

The direct mode is initialized once per connection/controller index, avoiding repeated mode switches on each zone command. Controller caches are invalidated on inventory-change notifications and rediscovered. Firmware and concurrent RGB apps can still defeat isolation; the UI and compatibility matrix make that physical-verification limit explicit. Do not claim that the iCUE LINK fan/cooler zones are physically independent until tested.

The protocol's transport acceptance is not physical write acknowledgment. Power/brightness are software approximations. Reconnect retries are bounded, re-enumerate devices and restore saved desired state. New IDs caused by changed serial/location are not automatically mapped to old selections.
