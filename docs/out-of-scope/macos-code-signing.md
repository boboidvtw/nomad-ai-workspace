# macOS code signing and notarization for Nomad AI Studio

**Decision (2026-10-27):** We do not sign or notarize the desktop app. Builds from
`npm --prefix packages/desktop run dist:mac` stay unsigned and are for the owner's own use.

## Why

- Signing needs a paid Apple Developer Program membership (USD 99 a year). That membership
  includes notarization at no extra cost.
- The app is used on the owner's own Macs and isn't distributed, so Gatekeeper's
  first-launch prompt costs only one click.
- Without a Developer ID certificate, signing config can't be tested, and untested config
  could break the unsigned builds that work today. So `packages/desktop/package.json` gets no
  `mac.notarize`, `hardenedRuntime` or entitlements changes.

## Reconsider when

- The app is shared with other people (a download link, a team, a public release), or
- macOS stops letting unsigned local builds open, or
- an Apple Developer membership already exists for another project.

## What it would take

1. Enrol in the Apple Developer Program and create a **Developer ID Application** certificate.
2. Create an App Store Connect API key for `notarytool`. Pass the key ID, issuer and key
   through environment variables only, never in the repo.
3. Add `hardenedRuntime`, entitlements and `notarize` to the electron-builder `mac` config.
   Check the variable names against the installed electron-builder version.
4. Verify with `spctl -a -vv` and `xcrun stapler validate` on the built `.app`.
