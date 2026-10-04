# Native behavior and account-scoped testing

Read the relevant section for Drive authorization, notification clicks, or sync tests. Native messaging requires the containing-app route in [native-app.md](native-app.md).

## Google Drive authorization

For first-time Safari Google Drive authorization, click **Connect Google Drive** in the extension popup. That user gesture opens the containing app through its custom URL scheme; Google Sign-In then continues in the user's default browser. Return to Safari and run the sync action again. Do not try to launch the containing app from `SafariWebExtensionHandler` with `NSExtensionContext.open`; the Safari extension point may reject it even though native messaging itself is healthy.

## Notification ownership and click evidence

For native notification click testing, keep notification ownership in the containing app. The Safari app extension may display a notification, but macOS can still report `can launch: false` for the response and never run the extension's notification delegate. The working route is:

```text
web extension -> Safari app extension -> containing app schedules notification
notification click -> containing app delegate -> Safari dispatchMessage -> target tab
```

Stream the project's privacy-safe notification logs during the live click:

```sh
log stream --level debug --style compact \
  --predicate 'subsystem == "fun.nagi.voyager.notif"'
```

Require the app-owned chain to reach `app didReceive` and `app dispatchMessage delivered to Safari`, then visibly confirm that Safari focuses the target conversation. Seeing only notification delivery is not enough. If system logs say the response targets the `.Extension` process with `can launch: false`, do not keep retrying reloads or add `.foreground`; fix ownership so the app schedules the notification. Never log or paste the full notification handoff URL because its encoded payload can contain conversation text and destination details.

If the wrong app opens, use [registration diagnosis](native-app.md#registration-diagnosis).

## Account scope and toolbar popovers

A popup opened as a standalone tab is useful for native-transport testing, but it has no Gemini source-tab account scope. Do not use that setup to validate successful highlight sync or other source-tab-scoped behavior; it is only suitable for checking that optional account-scoped data is skipped without blocking the base sync. Validate actual highlight upload or restore from the toolbar popup over a freshly reloaded Gemini tab.

Safari may dismiss a toolbar popover before an accessibility-driven button click reaches the web content. Do not record that dismissal as a product failure or a successful action. Use the standalone page only for non-scoped transport/fallback checks; use a real click in the toolbar popover for account-scoped behavior.
