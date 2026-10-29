# Getting started

Use the Windows portable candidate for installation without npm or JSON editing. It includes the Node runtime, dependencies, browser control panel and launcher. Release publication is pending approval; review artifacts live in successful GitHub Actions runs.

1. Follow [Windows installation](installation-windows.md), verify checksums and extract the full ZIP.
2. Start `Launch-Bridge.vbs`. Choose your private profile folder. **Existing users must select their exact existing data directory**, preserving pairing and state. Do not select the application/extraction directory.
3. OpenRGB must detect devices first. For Corsair RGB RAM, install the official signed PawnIO driver and run OpenRGB with the permissions required by its documentation. Close iCUE and competing RGB tools. Start the local SDK server.
4. In Settings, choose OpenRGB; save the confirmed change. Discover devices, select the intended whole controllers and give them HomeKit names. Confirm and save again.
5. Start the bridge and reveal private pairing information only when needed. Add it in Apple Home; see [pairing](apple-home-pairing.md).
6. Test each device. New lights start with desired software off (black). Enable sign-in startup if wanted. Closing the browser leaves the process running; use Quit application to exit cleanly.

For mock mode, choose the mock backend, save, discover the virtual light, enable it and save. It simulates color updates and never controls hardware.

Zones and groups are optional. Read [configuration](configuration.md) before enabling experimental zones; only eligible LED layouts are selectable. Group members cannot overlap enabled standalone lights or other enabled groups. Commands may partially apply when a member fails; diagnostics show the outcome.

The maintainer confirmed physical Corsair RAM color changes on the previous prototype. New UI/zone/group/Windows-startup features need the [manual checklist](manual-verification.md) before broad claims. No additional hardware, Homebridge, cloud account or telemetry is required.
