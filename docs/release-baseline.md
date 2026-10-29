# v0.1.0 change baseline

Baseline commit: `2bba73ede7f5cd80d2b7c70a6d361327bc80f5c6`.
Before changes, ESLint, TypeScript, all 43 automated tests, the real local HAP smoke, preview build and extracted package verification passed on the development Mac. The prior GitHub Windows/Linux matrix also passed; these results are baseline evidence, not verification of new work.

The existing CLI composes a serialized device manager, a mock or independently implemented OpenRGB protocol-3 adapter, HAP-NodeJS bridge, per-installation `identity.json`, HAP storage and atomic desired-state JSON. Whole-device UUIDs derive from the unchanged device ID. Migration must preserve these ID seeds, identity file, state keys, HAP storage directory and user-chosen ports, including 51827 installations. No local installation data is available or modified in this checkout.

The maintainer reports successful Windows installation/build/lint/43 tests, mock pairing, physical SDK discovery, hardware-bridge pairing and physical color changes on Corsair Vengeance RGB DDR5 RAM. Brightness, software off/on, other devices, zones, groups and recovery remain physically unverified. See hardware-compatibility.md for the detailed evidence boundary.
