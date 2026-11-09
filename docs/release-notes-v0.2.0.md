# HomeKit RGB Bridge 0.2.0 — V2 Desktop Experimental Preview

Release review candidate. Publication requires explicit maintainer approval.

## Changes

- A Windows x64 EXE installer with Start menu/desktop shortcuts and a local Electron interface.
- Compact Windows-style navigation and settings with system fonts, visible checkboxes and system light/dark colors. The interface remains Electron, not WinUI.
- A separate official Node sidecar with HAP-compatible crypto; Electron’s embedded runtime is not used for HomeKit cryptography.
- Guided real-hardware discovery, named light selection, color presets, brightness, HomeKit pairing guidance and clear demo-mode labeling.
- A tray menu and close-to-tray behavior, optional user-level Windows sign-in startup, and remembered settings/profile.
- Optional launch of an explicitly selected installed OpenRGB, avoiding a duplicate when its SDK port is already listening.
- Detected-profile picker with paths, selected-light counts, local HomeKit-file status, search refresh and a manual folder fallback. Recognized legacy startup entries can locate custom profiles; incomplete profiles are blocked.
- Explicit existing-profile selection and old-panel takeover; pairing, stable light IDs, selected ports and saved state remain in the private profile.
- Prevent empty HomeKit bridge starts and clear stale virtual discovery on backend changes.

## Install / upgrade

Verify the EXE against `SHA256SUMS-desktop.txt`, install it, and open HomeKit RGB Bridge. For an upgrade use Settings → Your profile to choose the exact existing profile before changing lights. Follow [desktop setup](desktop-v2.md). Uninstall retains private profiles and removes this app’s Windows sign-in entry.

## Requirements and known limitations

Windows 10/11 x64; separately installed OpenRGB and its required hardware access/driver; an awake PC on the same trusted LAN as Apple Home. OpenRGB support depends on exact hardware/firmware. Manufacturer utilities such as iCUE can conflict. OpenRGB/PawnIO are not bundled or elevated automatically. No cloud, Homebridge or additional hardware is required.

The installer is unsigned by this project and can trigger SmartScreen or organization policy. Do not disable those policies to run a candidate. No automatic updates, arm64 distribution or Windows service is provided. Startup is after sign-in. Sleep/off prevents control; physical recovery testing remains pending. Software off sends black and brightness scales RGB channels; neither is a native electrical-power claim.

Baseline maintainer verification covers virtual/hardware Apple Home pairing and Corsair Vengeance RGB DDR5 physical color only. The iCUE LINK hub, Logitech mouse and Gigabyte motherboard were discovered, without full physical-control verification. New desktop/zone/group/brightness/off/reconnect/reboot/sleep flows still require maintainer hardware testing. Automated tests use synthetic devices and do not replace those checks.

Attach the exact successful candidate CI run and installer checksum before approving a public pre-release. No public Release is claimed by this document.
