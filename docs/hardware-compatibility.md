# Hardware compatibility

Compatibility depends on the **specific model, controller, firmware, Windows build and OpenRGB version**. Detection in OpenRGB alone does not guarantee this bridge can control it.

V1 requires SDK protocol 3+ and a Direct mode with the per-LED-color flag, at least one LED and matching LED/color counts. The bridge lists zones but applies one color to all LEDs. Off is black, brightness is channel scaling, and neither is electrical power control. There is no independently verified hardware state readback.

Do not run OpenRGB alongside Corsair iCUE or other manufacturer RGB software during testing: conflicts can prevent access or overwrite effects. Never enable bus probing, drivers or zone resizing based on an assumption made by this bridge.

## Evidence categories

| Status               | Meaning                                                                                   | Current entries                                                     |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Maintainer-verified  | Exact setup tested with the manual checklist and linked evidence reviewed by a maintainer | **None**                                                            |
| Community-reported   | Contributor observed results; independent verification pending                            | **None yet**                                                        |
| Untested             | No observed support claim                                                                 | All physical models until evidence is added                         |
| Automated simulation | Mock adapter / synthetic TCP protocol fixtures                                            | Virtual RGB light; two-LED synthetic controller (not real hardware) |

## Submit a report

Open [a hardware compatibility issue](https://github.com/daqua22/homekit-rgb-bridge/issues/new?template=hardware.yml). Include:

- Manufacturer, exact device model and firmware, without raw serials.
- OpenRGB version, Windows version/build, Node version and bridge commit/version.
- Tested features: discovery, Direct mode, RGB colors, software on/off, software brightness, zones observed and multiple devices.
- Apple Home pairing result and behavior after bridge/Windows restarts.
- OpenRGB disconnect/reconnect, disappearance/reappearance and index-reorder behavior.
- Known problems, conflicts, workarounds and checklist results.
- Verification status: untested, community-reported, or maintainer-verified with a link to existing evidence.

Use [manual-verification.md](manual-verification.md). Share only sanitized screenshots if they show real observed behavior; never include a setup code/QR, HAP storage, serials or full private paths. The reporter's dropdown selection alone cannot establish maintainer verification.

Maintainers should add a row with manufacturer/model, exact versions, supported features, known problems, status, test date and issue/evidence link. Do not promote a community claim without reviewing repeatable evidence. Negative reports are useful and should remain visible. Re-test after firmware/OpenRGB changes; an old row is not universal support.
