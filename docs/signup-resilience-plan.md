# Sign-up resilience plan

Sign-up today waits on Polar. Its Better Auth plugin turns any Polar failure into a 500 carrying the raw SDK text, and the auth forms show `error.message` as is. This plan stops server internals from reaching users, takes Polar out of sign-up by creating the Polar customer only before checkout and the portal, and catches a mistyped email domain ourselves with "Enter a valid email".

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [signup-resilience-log.md](signup-resilience-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | No server internals in auth errors | – | done | `fix(backend, web): hide server internals in auth errors` |
| 2 | Own the Polar customer lifecycle | 1 | done | `feat(backend): own the Polar customer lifecycle` |
| 3 | Reject email domains that can't receive mail | 1 | done | `feat(backend, web): reject email domains that can't receive mail` |
| 4 | Code review | 2, 3 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **Sign-up never calls Polar.** The Polar customer is created by our own ensure step, just before `/checkout` and `/customer/portal`. While Polar is down only those two actions fail, with a message the user can act on.
- **Email domains are checked by DNS, on sign-up and on email change.** A domain with no mail route is refused with "Enter a valid email" on the email field. A DNS error or timeout lets the address through, so a DNS outage never blocks sign-up.

### Defaults (not yet confirmed; change only if asked)

1. The backend rewrites any 5xx JSON body from `/api/auth/*` to a generic message, unless its `code` is one of `AUTH_ERROR_CODES`. It logs the path and status, never the original body, which can carry customer data.
2. The frontend shows an auth error's `message` only when the status is below 500 or the `code` is in `AUTH_ERROR_CODES`. Otherwise it shows "Something went wrong. Try again in a moment."
3. Two new codes: `BILLING_UNAVAILABLE` (503: Polar timed out, 5xx or unreachable; "try again") and `BILLING_ACCOUNT_REJECTED` (409: Polar refused the email, or the email is already linked to another customer; "contact support").
4. The ensure step also updates the customer's email and name when they differ from the user's, which heals a sync that failed earlier.
5. Customer sync on user update stays best effort, as in the plugin: it runs on every update, ignores a 404 (no customer yet) and logs any other failure.
6. Outside `NODE_ENV=prod`, domains under the reserved `.test` TLD skip the DNS check, so e2e sign-ups with `@sinwy.test` keep working. Seeds insert rows directly and never hit the check; unit tests stub DNS.
7. Google sign-ups are not DNS-checked: Google already verified the address.
8. The `polarCore.buildRequest` override that anonymizes deletes is removed. Our own delete passes `anonymize: true` explicitly.

## Standing notes

- Since phase 2 our own code owns the Polar customer (`modules/billing/customer.ts`, through `polarCore` and the SDK's standalone customer functions); the plugin's `createCustomerOnSignUp` is off. Sign-up makes no Polar call.
- Every user update, email verification included, sends one best-effort `PATCH /v1/customers/external/{id}` (Default 5); while Polar is unreachable it logs `ERROR [billing:customer] Polar customer sync failed` and the request succeeds. It's the one Polar call on the verification path, and a hung Polar delays verification by up to the 5 s timeout (phase 4; log, phase 2).
- The plugin's checkout sends `external_customer_id: session.user.id` and no email. Polar prefills and locks the email only when the customer already exists, which the ensure in `hooks.before` guarantees. The portal (`createCustomerSessions` by `external_customer_id`) fails outright without one.
- Verified on the Polar sandbox (API 2026-10): `GET /v1/subscriptions/` and `GET /v1/orders/` with an unknown `external_customer_id` return `200` with `total_count: 0`. `GET /v1/customers/external/{id}` returns `404 {"error":"ResourceNotFound"}`. A deleted customer answers 404 by id and by external id and drops out of the email search, so the API can't show that it was anonymized rather than removed.
- Polar docs: customer `email` and `external_id` are each unique per organization, and `external_id` can't change once set.
- Polar answers 422 ("special-use or reserved name") to a customer email on a reserved TLD such as `.test`, which maps to `BILLING_ACCOUNT_REJECTED`. E2E checkout and portal steps need plus-aliases of `SEED_EMAIL_BASE`; `@sinwy.test` only works up to login (log, phase 2).
- `polarFailureOf` / `describePolarError` (`infrastructure/polar/polarErrors.ts`) split Polar failures into rejected (4xx) and unavailable (5xx, 429, timeout, network), and log without bodies. Client timeout is 5 s.
- Every `authClient` caller shows errors through `authErrorMessage(error)` (`WebFrontend/src/shared/lib/auth/auth-error.ts`): the message for status < 500 or a code in `AUTH_ERROR_CODES`, otherwise "Something went wrong. Try again in a moment." A new code must go into `AUTH_ERROR_CODES` to survive at 5xx, there and in the backend rewrite (`modules/auth/routes.ts`). Code-specific UI (a field error) branches on `error.code` before calling it.
- The plugin logs Polar's raw error text, response body included, through Better Auth's logger for checkout and the portal (`ERROR [auth] Polar checkout creation failed. Error: … 500 - {…}`). It never reaches the client. Better Auth also logs `INFO [auth] Sign-up attempt for existing email: <address>`. Both are for phase 4 (log, phase 1).
- `bun run dev:seed-scenario` signs up through the real sign-up route, so its `SEED_EMAIL_BASE` plus-aliases go through the DNS check (gmail.com passes); it can't make a `@sinwy.test` user.
- E2E stand-ins for a failing Polar: `HTTPS_PROXY=http://127.0.0.1:9 bun run start:server` makes Polar unreachable (`PolarNetworkError`, so `BILLING_UNAVAILABLE`); `POLAR_ACCESS_TOKEN=polar_invalid_e2e` makes it answer 401 (so `BILLING_ACCOUNT_REJECTED`). A set env var beats `.env`.
- `stubPolarCore` takes a `Response` or a function per route, and by default answers 404 to `GET /v1/customers/external/*` (no customer yet). `modules/auth/tests/signUp.test.ts` spies on the global `fetch`, which both Polar clients use, and reads the verify link from the outbox email's `props.verifyUrl`.
- `example.com` publishes a null MX (RFC 7505) and is refused. Test emails use `@sinwy.test`, `@sign-up.test` (skipped outside prod) and `@test.dev` (`createUserWithSession`, inserted directly, never checked).
- The DNS check (`modules/auth/emailDomain.ts`) runs in `hooks.before` for `/sign-up/email` and `/change-email`: one MX lookup on the happy path, A and AAAA only when there is no MX, 2 s cap, fails open with a WARN naming only the domain. In Bun, NXDOMAIN rejects with `ENOTFOUND` and a null MX comes back as `{ exchange: "" }`. Tests stub it with `spyOn` on the default `node:dns/promises` export (log, phase 3).
- Every `APIError` thrown from `hooks.before` is logged by Better Auth as `ERROR [Better Auth]: <message>` (its router `onError`, at our `LOG_LEVEL`), so each "Enter a valid email" refusal is an ERROR line, like the checkout and organization refusals. For phase 4 (log, phase 3).
- `showFieldError(form, name, message)` (`WebFrontend/src/shared/lib/form.ts`) puts a server refusal on one field. The next form validation clears it, so an edit to any field removes it.

---

## Phase 4: Code review

**Goal:** A review of phases 1 to 3 against auth, money and data-deletion risks, with findings fixed or recorded.

**Files:** `git diff 7427aa8 HEAD` (the commit before phase 1). The paths that matter:
- Backend: `modules/auth/auth.ts` (`hooks.before`, `databaseHooks.user.update.after`, `deleteUser`), `modules/auth/routes.ts` (5xx rewrite), `modules/auth/emailDomain.ts`, `modules/auth/deletedUserCleanup.ts`, `modules/billing/customer.ts`, `infrastructure/polar/polarClient.ts` and `polarErrors.ts`.
- Tests: `modules/auth/tests/signUp.test.ts`, `emailDomain.test.ts`, `userUpdateHook.test.ts`, `deleteUserCallback.test.ts`, `modules/billing/tests/customer.test.ts` and `billing.test.ts`, `test/helpers.ts` (`stubPolarCore`).
- Frontend: `src/shared/lib/auth/auth-error.ts`, `src/shared/lib/form.ts` (`showFieldError`), `src/modules/auth/lib/useRegister.ts`, `src/modules/account-dashboard/components/settings/EmailSection.tsx`.
- Logs to judge: the plugin's raw Polar error text (standing notes), Better Auth's `Sign-up attempt for existing email`, and its ERROR line for every hook refusal.

**Steps:**
- Check that no path reaches Polar during sign-up, verification or login.
- Check that checkout can never create a customer under a different email than the account's, and can't proceed without a customer.
- Check that user deletion still revokes the plan and anonymizes the customer, and that a late webhook for the deleted id still finds no user.
- Check that the 5xx rewrite can't hide a deliberate refusal, and that nothing logs a Polar body or a customer email.
- Check that the DNS check fails open and doesn't add latency on the happy path beyond one lookup.

**Tests that matter:** Whatever the review finds missing on the paths above.

**Done when:** Findings are fixed or written into the log with a reason.

**Verify:** None.
