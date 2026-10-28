# Versioning and release process

Current package version: `0.1.0-dev.0`. **No version tag or public Release is created by the build.** Use semantic versioning. The first published preview should use tag `v0.1.0`, GitHub's **pre-release** flag and an explicit experimental title while hardware testing remains incomplete. Never describe a JavaScript archive as a standalone executable.

## Release gates

1. A clean checkout at the intended immutable commit passes `npm ci`, `npm run check`, `npm run format:check`, `npm run smoke`, `npm run licenses`, `npm run package:preview`, `npm run package:verify` and `npm audit --omit=dev`.
2. GitHub CI is successful on Windows and Linux for the candidate commit. Verify the packaged runtime on Windows. A CI result is not a physical Windows reboot test.
3. At least the mock Apple Home pairing/control/restart path is manually exercised before calling the preview ready for Apple Home use. Link the manual evidence. This gate is currently unmet, so no release is published by the initial implementation.
4. Reconcile documentation with actual functionality and record unverified hardware/Windows startup scenarios explicitly. Hardware-incomplete releases must remain experimental/pre-release with no verified-model claim.
5. Inspect tracked files and archive contents for secrets, pairing data, local configuration, raw serials and private paths. Review dependencies/notices after any version change.
6. Review the exact distribution: compiled JavaScript, runtime lockfile, docs, notices and command launcher; no Node runtime, OpenRGB binary, native installer or `.exe`.

When the gates pass, update version and changelog in a normal commit, rebuild from that clean commit, check archive content and calculate checksums. Review and explicitly authorize release publication. This repository's workflows do not create tags or publish releases/packages automatically.

## Notes required with each release

- Exact version/commit and experimental/pre-release status.
- Implemented behavior, executed automated and manual checks, and exact tested hardware environments.
- Known limitations and a prominent list of untested features/models.
- Archive and `SHA256SUMS.txt`, plus checksum verification commands.
- Node/OpenRGB prerequisites and [installation](installation-windows.md) steps.
- Backup, upgrade, rollback and any configuration migration instructions.
- Licensing and retained third-party notices.

A maintainer may then use the GitHub release UI or `gh release create v0.1.0 <archive> <checksums> --prerelease --title "v0.1.0 — Experimental preview" --notes-file <reviewed-notes>` only after that authorization. No command in this guide should be read as an instruction to publish an unverified release.
