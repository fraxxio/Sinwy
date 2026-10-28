# Sign-up resilience plan

Sign-up today waits on Polar. Its Better Auth plugin turns any Polar failure into a 500 carrying the raw SDK text, and the auth forms show `error.message` as is. This plan stops server internals from reaching users, takes Polar out of sign-up by creating the Polar customer only before checkout and the portal, and catches a mistyped email domain ourselves with "Enter a valid email".

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [signup-resilience-log.md](signup-resilience-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | No server internals in auth errors | – | done | `fix(backend, web): hide server internals in auth errors` |
| 2 | Own the Polar customer lifecycle | 1 | done | `feat(backend): own the Polar customer lifecycle` |
| 3 | Reject email domains that can't receive mail | 1 | todo | |
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
- `bun run dev:seed-scenario` signs up through `auth.api.signUpEmail` (`scripts/dev/seedScenario.ts`), so Default 6's "seeds insert rows directly" doesn't hold for it: in phase 3 its `SEED_EMAIL_BASE` addresses go through the real DNS check.
- E2E stand-ins for a failing Polar: `HTTPS_PROXY=http://127.0.0.1:9 bun run start:server` makes Polar unreachable (`PolarNetworkError`, so `BILLING_UNAVAILABLE`); `POLAR_ACCESS_TOKEN=polar_invalid_e2e` makes it answer 401 (so `BILLING_ACCOUNT_REJECTED`). A set env var beats `.env`.
- `stubPolarCore` takes a `Response` or a function per route, and by default answers 404 to `GET /v1/customers/external/*` (no customer yet). `modules/auth/tests/signUp.test.ts` spies on the global `fetch`, which both Polar clients use, and reads the verify link from the outbox email's `props.verifyUrl`.
- `example.com` publishes a null MX (RFC 7505), so a correct check refuses it. Test and seed emails mostly use `@sinwy.test` and `@test.dev`.

---

## Phase 3: Reject email domains that can't receive mail

**Goal:** Sign-up and email change refuse a domain with no mail route, with "Enter a valid email" on the email field, without ever blocking on DNS trouble.

**Files:**
- New `Sinwy.Backend/modules/auth/emailDomain.ts`.
- `Sinwy.Backend/modules/auth/auth.ts`, `hooks.before`: add branches for `/sign-up/email` (`ctx.body.email`) and `/change-email` (`ctx.body.newEmail`) next to the `/checkout` and `/customer/portal` ones.
- `Sinwy.Backend/lib/appConfig.ts` (`NODE_ENV`: `dev | local | prod | test`).
- `Sinwy.Shared/types/auth/Auth.ts`: add `EMAIL_DOMAIN_INVALID` (a 400, so it passes the 5xx rewrite anyway).
- Tests: `modules/auth/tests/signUp.test.ts` (sign-up through `auth.api.signUpEmail`, outbox reading; add the refusal cases), a new `emailDomain` unit test with DNS stubbed. Change-email tests: `grep -rn changeEmail Sinwy.Backend/modules/auth/tests`.
- Frontend: `src/modules/auth/lib/useRegister.ts` (`onSubmit`), `src/modules/account-dashboard/components/settings/EmailSection.tsx`.
- Docs: `docs/org-rules-map.md` §13 lists only organization and billing errors, so only the code comment on `AUTH_ERROR_CODES`.

**Steps:**
- Lookup with `node:dns/promises`. MX records (other than a lone null MX `.`) mean the domain is valid. No MX but an A or AAAA record means valid, as an implicit MX. `ENOTFOUND` or `ENODATA` on all of them means invalid. Any other error, or a timeout of about 2 s, lets the address through and logs a warning with the domain only.
- Refuse with `APIError` 400 `EMAIL_DOMAIN_INVALID`, message "Enter a valid email". Run the check before Better Auth looks up the user, so the answer reveals nothing about existing accounts.
- Skip `.test` domains outside prod (Default 6). Don't check Google sign-ups (Default 7).
- Frontend: on `EMAIL_DOMAIN_INVALID`, put the message on the email field, not in the form-level error, in both forms.

**Tests that matter:**
- NXDOMAIN refused; MX present passes; A only passes; null MX (`example.com` style) refused; SERVFAIL or timeout passes. All with DNS stubbed: no network in tests.
- A refused sign-up creates no `user` row and sends no email. A refused email change sends no confirmation email.
- `.test` passes outside prod and is looked up in prod.

**Done when:**
- `someone@gmail.con` on the sign-up form shows "Enter a valid email" under the email field, and no row is written.

**Verify:** Seed a verified user. On the sign-up form, enter a name, `newuser@no-such-domain-sinwy.invalid` and a valid password. The email field shows "Enter a valid email", no `user` row exists for that address, and no email is sent. Sign up with `newuser@sinwy.test`: the "check your inbox" screen appears. Log in as the seeded user, open Account → Settings → Email and change to `x@gmail.con`: the field shows "Enter a valid email" and no confirmation email is sent. DNS is real (the e2e run needs network).

---

## Phase 4: Code review

**Goal:** A review of phases 1 to 3 against auth, money and data-deletion risks, with findings fixed or recorded.

**Files:** The diff from the commit before phase 1 to HEAD.

**Steps:**
- Check that no path reaches Polar during sign-up, verification or login.
- Check that checkout can never create a customer under a different email than the account's, and can't proceed without a customer.
- Check that user deletion still revokes the plan and anonymizes the customer, and that a late webhook for the deleted id still finds no user.
- Check that the 5xx rewrite can't hide a deliberate refusal, and that nothing logs a Polar body or a customer email.
- Check that the DNS check fails open and doesn't add latency on the happy path beyond one lookup.

**Tests that matter:** Whatever the review finds missing on the paths above.

**Done when:** Findings are fixed or written into the log with a reason.

**Verify:** None.
