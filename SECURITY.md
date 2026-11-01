# Security design
- Electron renderer: contextIsolation, sandbox, no Node integration, no webviews, DevTools off in release, all permission requests denied, navigation and new windows blocked.
- Strict CSP: no remote scripts, images, or network from the UI.
- Feed text is untrusted: HTML/control/bidi characters stripped, length-capped, and rendered with textContent only. Links must be https without credentials, checked again before opening in the browser.
- Background picture: chosen in a native file dialog in the main process, size-capped (10 MB), checked by file signature (JPEG or PNG only), decoded and re-saved as a small JPEG; the renderer only ever receives that JPEG as a data URL (CSP `img-src data:`, no remote images, no Node in the renderer).
- Only a fixed allowlist of outlets is ever displayed (src/sources.js). Settings are validated in the main process.
- Dependencies are pinned exactly with a lockfile; `npm audit --omit=dev` is clean. CI runs `npm ci`.
## Reporting a vulnerability
Please report privately through GitHub: Security tab > "Report a vulnerability" on this repository. Do not open a public issue. This is a spare-time project, so expect a reply within about a week.

## Release status (read before trusting a download)
- **Installers are not code-signed yet.** Windows SmartScreen will show an "unknown publisher" warning. Verify downloads against the `SHA256SUMS.txt` attached to each release, or build from source.
- **Auto-update is disabled in the code** (`src/updates.js`) until `build.win.publisherName` is set in package.json. A test fails while that field is set, so turning updates on is always a deliberate change, and the app never downloads or runs updates while unsigned.
- Releases are built by GitHub Actions from a version tag (`.github/workflows/release.yml`) and stay a dry run until the maintainer sets the repository variable `PUBLISH_RELEASES=true`.

## Needs the maintainer before signed releases
1. **Code signing:** apply for free open-source signing (SignPath Foundation) or buy an OV/EV certificate (or Azure Trusted Signing). Then add the signing secrets in GitHub, and set `build.win.publisherName` in package.json to the exact certificate subject. Updating `test/updates.test.js` to expect updates ON is part of that change.
2. **Auto-update:** electron-updater pulls from GitHub Releases; Windows verifies the update is signed by the same publisher. Never ship updates from an unsigned build.
