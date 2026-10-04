# Native app builds and registration recovery

Read for Swift/app integration, native messaging, signed-distribution tests, duplicate extensions, or incorrect app/custom URL routing. The shared safety and authorization rules in [SKILL.md](../SKILL.md) apply throughout.

For signed-distribution validation, use the notarized CI artifact; the development sequence below applies to local native integration.

## Development build

1. Run `bun run build:safari` first so the Xcode resources are current.
2. Build the tracked Xcode project with Apple Development signing. Allow Xcode to refresh the local development profile and register the current Mac when needed.

   **Use both paths below verbatim for every local `xcodebuild`.** Task-specific DerivedData directories strand large build caches. `bun run clean:build` reclaims derived data while retaining the SPM cache.

   ```sh
   xcodebuild \
     -project "Voyager/Voyager.xcodeproj" \
     -scheme "Voyager" \
     -configuration Debug \
     -destination "platform=macOS,arch=$(uname -m)" \
     -derivedDataPath .build/safari-native-test-derived \
     -clonedSourcePackagesDirPath .build/sparkle-source-packages \
     -allowProvisioningUpdates \
     -allowProvisioningDeviceRegistration \
     build
   ```

3. Before opening the app, inspect whether macOS will route the extension or custom URL to an older development copy:

   ```sh
   CURRENT_APP="$PWD/.build/safari-native-test-derived/Build/Products/Debug/Voyager.app"
   ps -axo pid=,command= | rg '/(Gemini Voyager|Voyager)\.app/Contents/MacOS/'
   pluginkit -m -A -D -v -i com.yourCompany.Gemini-Voyager.Extension
   ```

   The expected result is one current `Voyager.app` process at most and exactly one enabled extension path inside `$CURRENT_APP`. If an old app under a known `.build` or DerivedData directory appears, apply the recovery authorization rule in [SKILL.md](../SKILL.md) first: prepare the exact stale/current paths and recovery plan, then reuse existing explicit recovery authorization or obtain it if missing. With Safari closed, quit only that development process, unregister that exact stale app path, and register the current app again:

   ```sh
   LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
   "$LSREGISTER" -u "<exact-known-stale-development-app-path>"
   "$LSREGISTER" -f "$CURRENT_APP"
   ```

   Re-run both read-only checks before continuing. Never bulk-reset LaunchServices, and never unregister or remove an app in `/Applications` without explicit permission.

4. Run the Debug containing app from Xcode when the change needs native messaging or app/extension interaction. Product > Build updates the macOS extension; Product > Run installs the containing app.
5. Use the Debug app explicitly. Do not test an unnotarized Developer ID Release build in Safari; release validation must use the notarized CI artifact.
6. Confirm Safari still shows exactly the intended Voyager entry and that it remains enabled. Test the native action and the corresponding web behavior.

Use `scripts/build-safari-release.sh` only for a release or explicit signed-distribution test. Do not use release installation as the routine CSS/TypeScript refresh loop.

For Drive authorization, notification delivery/clicks, or account-scoped sync, read [native-behavior.md](native-behavior.md).

## Registration diagnosis

Inspect LaunchServices, process paths, and `pluginkit` read-only first. `pluginkit -mAvvv -p com.apple.Safari.web-extension` is also a read-only diagnostic. Prefer exact app paths over display names or bundle identifiers when several development copies exist. Follow the targeted recovery procedure above only with its authorization and recovery plan; never delete app data, extension containers, preferences, or permissions.

If clicking a native notification opens an old updates/status window or reports **Safari Extension Unavailable**, inspect the launched process path first. LaunchServices may have selected a stale containing app; this is not evidence that the notification bridge or repository rename failed.
