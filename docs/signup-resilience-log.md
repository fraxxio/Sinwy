# Sign-up resilience log

Finished phases of [signup-resilience-plan.md](signup-resilience-plan.md), each with its spec and log entry.

## Phase 1: No server internals in auth errors

**Goal:** No `/api/auth/*` failure can put server or Polar text in front of a user. Known, deliberate refusals keep their messages.

**Files:**
- `Sinwy.Backend/modules/auth/routes.ts` (`registerAuthRoutes`): the single place `auth.handler` is mounted.
- `Sinwy.Shared/types/auth/Auth.ts` (`AUTH_ERROR_CODES`).
- New frontend helper in `Sinwy.WebFrontend/src/shared/lib/auth/` (next to `auth-client.ts`).
- Callers to switch: `src/modules/auth/lib/useRegister.ts`, `src/modules/auth/lib/useLogin.ts`, `src/modules/auth/components/GoogleSignInButton.tsx`, `src/modules/account-dashboard/components/settings/EmailSection.tsx`, `src/modules/account-dashboard/lib/billing-queries.ts` (`openPolarPortal`), `src/modules/account-dashboard/routes/_shell.billing.tsx` (`choosePlan`), `src/modules/account-dashboard/lib/account-queries.ts` (`checkoutForTransfer`). Grep `authClient\.` for any other caller that shows `error.message`.

**Steps:**
- Backend (Default 1): in `registerAuthRoutes`, when the handler answers 5xx with a JSON body whose `code` is not in `AUTH_ERROR_CODES`, replace the body with `{ code: "INTERNAL_SERVER_ERROR", message: <generic> }` and keep the status. Log path and status at error level, without the body. Leave non-JSON responses and redirects alone. The webhook endpoint (`/api/auth/polar/webhooks`) only needs its status, so the rewrite is harmless there.
- Frontend (Default 2): one helper takes the Better Auth client error and a fallback, and returns the text to show. Every caller above uses it. Keep the existing code-specific branches (`EMAIL_NOT_VERIFIED`, `PLAN_EXISTS`, `INVALID_TOKEN`) as they are.
- The helper lives in `shared/`, so it must not import from `src/modules/`.

**Tests that matter:**
- Backend: a forced 500 from a Better Auth endpoint (e.g. a stubbed Polar failure on `/checkout`, or a hook that throws a plain `Error`) comes back with the generic body and no trace of the original message. A 4xx refusal (`PLAN_EXISTS`) comes back unchanged.
- Frontend: the helper returns the fallback for status 500 and for a missing status, the message for a 4xx, and the message for a 5xx carrying an `AUTH_ERROR_CODES` code.

**Done when:**
- No auth or billing caller in the frontend renders `error.message` from `authClient` directly.
- A 500 from `/api/auth/*` carries only the generic message.

**Verify:** Seed a verified user with no plan, with Polar simulated as failing on checkout creation (stub the sandbox call to 500). Log in, open Account → Billing and choose a plan. The page shows "Something went wrong. Try again in a moment." and no Polar text, and the network response body is the generic one. Then sign up with an email already registered: the existing Better Auth behaviour is unchanged (the "check your inbox" screen).

### Log (2026-10-28, `fix(backend, web): hide server internals in auth errors`)
- Shipped: `registerAuthRoutes` replaces any 5xx JSON body from `/api/auth/*` whose `code` isn't in `AUTH_ERROR_CODES` with `{ code: "INTERNAL_SERVER_ERROR", message: "Something went wrong. Try again in a moment." }`, keeping status and headers (minus `content-length`), and logs `Auth endpoint failed { path, status }`. Frontend `authErrorMessage` in `shared/lib/auth/auth-error.ts`, used by all 17 `authClient` error sites (the 7 listed plus `ProfileSection`, `PasswordSection`, `SessionsSection` ×2, `ConnectedAccountsSection` ×2, `DangerZone`, `account-queries` accounts and sessions, `transfer-queries` members, `shared/lib/auth/permissions.ts`). `stubPolarCore` accepts a `Response`. Tests: a Polar 500 on `/checkout` comes back as exactly the generic body; `PLAN_EXISTS` keeps code and message; five helper cases.
- Differs from plan: the helper takes no fallback. Default 2 gives every unexpected error the same text, so a per-caller fallback would never show; the old per-caller fallbacks ("Checkout failed", "Sign in failed", …) are gone. The plan named a `PLAN_EXISTS` frontend branch; there is none, the 400 message is just shown, which still works. Found: the plugin itself logs Polar's raw error text with the response body (`Polar checkout creation failed. Error: Polar API returned a server error: 500 - {…}`), and Better Auth logs the full address on a duplicate sign-up. Neither reaches the client; both are left for phase 4.
- Checked in the running app (e2e, backend started with a bad `POLAR_ACCESS_TOKEN`; Polar answered 401 and the plugin turned it into a 500): choosing Starter on Account → Billing shows "Something went wrong. Try again in a moment." with no Polar text; `POST /api/auth/checkout` → 500 with exactly the generic body; log has the plugin line and `Auth endpoint failed { path: "/api/auth/checkout", status: 500 }`. Duplicate sign-up with the seeded address shows "Check your inbox", writes no row, sends no email, makes no Polar call. Not checked live: a real Polar 5xx (covered by the unit test) and a successful sandbox checkout passing through the rewrite (covered by the existing plugin checkout tests that answer 200).
