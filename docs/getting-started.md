# Getting started

HomeKit RGB Bridge is an experimental CLI for an awake Windows PC. It translates Apple Home light commands into local OpenRGB updates. A mock mode lets you evaluate the HomeKit side without hardware. No Apple Home or physical RGB verification has been completed by this project yet.

1. Install a supported Node.js runtime (Node 24 recommended) and Git, then follow [Windows installation](installation-windows.md).
2. Clone the repository, run `npm ci` and `npm run build`.
3. Run `npm start -- init --mock`, then `npm start -- list`.
4. In a private terminal, run `npm start -- start --pairing`.
5. Follow [Apple Home pairing](apple-home-pairing.md). Mock commands update an in-memory simulated light, not your PC hardware. Set `logging` to `debug` to see fixed `light_command_sent` events.
6. Stop with Ctrl+C; start again with `npm start`. Keep the data directory to retain identity, HAP keys and last desired light state.
7. For hardware, set up [OpenRGB](openrgb-setup.md) and use a separate data directory with `init` (without `--mock`). Discover IDs with `list`, opt in through [configuration](configuration.md), validate with `check`, then start.

Do not run the same data directory in two processes. Do not share QR/setup information. The app does not control hardware until you enable devices and start it; new selected lights start at software off (black).

Use [troubleshooting](troubleshooting.md) if the accessory is missing, and record actual results with the [manual checklist](manual-verification.md). Reaching a listening TCP port alone does not prove discovery or pairing from an iPhone.
