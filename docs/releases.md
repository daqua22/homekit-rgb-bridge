# Release review and publication

Current desktop candidate package version: `0.2.0`; proposed title: **HomeKit RGB Bridge 0.2.0 — V2 Desktop Experimental Preview**. The earlier `0.1.0` candidate remains separate and unpublished. Semantic versioning applies. Version metadata alone is not publication or release completion.

**Do not publish or tag until the maintainer explicitly approves publication after reviewing the checks and limitations.** Both CI and the manual Release candidate review workflow use read-only repository permissions and only build/validate/upload artifacts. Ordinary commits cannot publish packages or releases. This implementation prepares a PR and draft notes, not a public Release.

## Mandatory candidate review

- Full lint, strict types, automated tests, build, formatting, HAP smoke, browser flow, license notices and runtime dependency audit pass from a clean checkout.
- GitHub CI passes for the exact candidate revision on Windows/Linux Node 24/26; Windows x64 portable checks and desktop installer/install/actual EXE/renderer isolation/login registration/uninstall checks pass. Download and compare SHA-256 from the same build.
- Review existing-installation regression evidence: unchanged whole UUID seeds, identity/HAP files/ports; backed-up versioned config/state changes; deliberate-only reset. Never use a live profile in CI.
- Review local API authentication/Host/Origin/CSP/body/rate limits, local file permissions, credential exposure, no persistent hardware-profile changes, runtime/dependency licenses and unresolved security issues. Do not approve with unresolved critical findings.
- Review actual media and compatibility claims. Maintainer RAM color/pairing evidence is distinct from new candidate physical tests and synthetic zone/group checks.
- Complete or explicitly accept the listed manual experimental limitations; fresh desktop install, real upgrade, zone/group behavior and lifecycle remain pending until observed. Do not claim a production-ready installer or fully verified hardware.
- Review [desktop draft notes](release-notes-v0.2.0.md), installation/upgrade/rollback/uninstall and the precise artifact contents.
- Obtain explicit publication approval. No approval is inferred from successful CI or a request to prepare the release.

If publication is later authorized, select the reviewed immutable revision, use normal non-force Git workflow, create the explicitly approved version tag, and publish the reviewed EXE/checksum/notes with GitHub's **pre-release** flag. Record that GitHub confirmed publication before reporting success. Do not promote unreviewed rebuilt artifacts or silently move a tag.

No code-signing certificate purchase, external purchase, automatic registry publication, firmware change, fan/pump control or driver bundling is part of this release.
