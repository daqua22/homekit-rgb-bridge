# Contributing

Bug reports, focused fixes, documentation and hardware evidence are welcome. Follow the [code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities through [SECURITY.md](SECURITY.md), not a public issue containing secrets.

1. Search existing issues. Use the appropriate bug, feature or hardware form.
2. Fork the repository and create a focused branch.
3. Use Node 24 and `npm ci`; preserve the lockfile.
4. Implement the change with meaningful tests for altered behavior. Never require physical hardware in CI.
5. Run `npm run check`, `npm run format:check`, `npm run smoke`, `npm run test:browser`, `npm run licenses`, `npm run package:preview` and `npm run package:verify`. On Windows x64 also run `npm run package:windows` and `npm run verify:windows`; install Chromium before browser tests.
6. Update docs and limitations. Use a conventional commit such as `fix(openrgb): invalidate stale device indices`.
7. Open a pull request using the template. Explain user-visible behavior, executed checks and hardware tests still pending.

Keep PRs small. Do not add cloud services, analytics, vendor drivers or a UI framework to V1. For adapters, implement `src/adapters/rgb-adapter.ts`, describe state/acknowledgment semantics, report capabilities truthfully, add synthetic fixtures and exercise connection loss. Never route by a mutable enumeration index as a persistent identity. Review dependency licensing before changes and regenerate notices.

Never attach setup codes, QR images, HAP storage, raw device serials, full local paths or unredacted logs. Hardware reports need exact versions and observed features; use [the process](docs/hardware-compatibility.md). CI passing is not evidence of Apple Home pairing or hardware support.

By contributing you agree to license original contributions under the project's MIT license. Keep required third-party copyright and license notices. No contributor license assignment is required.

Preserve legacy UUID seeds, identity/HAP paths, state keys and user-selected ports. Add regression tests before migrations; read legacy data without rewriting it and back up before explicit saves. Zone/group changes must reject overlapping targets, preserve other LED bytes and report partial failures. The local UI requires bearer/Host/Origin protections, accessible keyboard flows and no credential-bearing screenshots/traces. Release candidates require maintainer review and explicit publication approval; PRs must not create tags/releases automatically.
