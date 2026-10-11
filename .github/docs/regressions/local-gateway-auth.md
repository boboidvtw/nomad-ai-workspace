# Local gateway auth (daemon and Studio bridge)

## Any website could read the auth token from the dashboard

- **Trap:** `/dashboard` is a public route so a browser can open it without a token,
  and the server inlines the auth token into that HTML (`injectDashboardAuth`). Public
  routes also got `Access-Control-Allow-Origin: *`, so a script on any website could
  `fetch('http://127.0.0.1:8765/dashboard')`, read the body and pull out the token.
- **Rule:** Public means "no token needed to load", not "readable by every origin".
  Routes that serve the token (`isDashboardPath`) never get a CORS grant, and the
  dashboard response sends `Cross-Origin-Resource-Policy: same-origin` and
  `X-Frame-Options: DENY`. Only token-free routes such as `/api/probe` keep `*`.
- **Guard:** `packages/daemon/src/__tests__/security.test.js`
