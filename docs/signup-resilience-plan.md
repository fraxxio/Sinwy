# Sign-up resilience plan

Sign-up today waits on Polar. Its Better Auth plugin turns any Polar failure into a 500 carrying the raw SDK text, and the auth forms show `error.message` as is. This plan stops server internals from reaching users, takes Polar out of sign-up by creating the Polar customer only before checkout and the portal, and catches a mistyped email domain ourselves with "Enter a valid email".

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [signup-resilience-log.md](signup-resilience-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | No server internals in auth errors | – | done | `fix(backend, web): hide server internals in auth errors` |
| 2 | Own the Polar customer lifecycle | 1 | todo | |
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

- Better Auth 1.7.12 runs `databaseHooks.user.create.after` **after the sign-up transaction commits** (`queueAfterTransactionHook`), and the verification email goes out inside the transaction. Today a Polar failure therefore leaves a committed user with no customer, sends the verification email anyway, and still answers 500. Retrying the sign-up goes through `onExistingUserSignUp`.
- `@polar-sh/better-auth` 2.1.0: `createCustomerOnSignUp` gates three hooks, not one: create on `user.create.after` (throws), `updateExternal` on `user.update.after` (logs only) and `deleteExternal` on `user.delete.after` (logs only). Turning it off removes all three, so phase 2 must replace update and delete.
- The plugin's create hook first lists customers by email. It links an individual customer that has no `external_id`, refuses (`CONFLICT`) one linked to another id, refuses when a team customer has that email, and otherwise creates `{ email, name, external_id: user.id }`. Phase 2 mirrors this.
- The plugin's checkout sends `external_customer_id: session.user.id` and its body schema has no `customer_email`. Polar prefills and locks the email only when the customer already exists, so the customer must exist before checkout. The portal (`createCustomerSessions` by `external_customer_id`) fails outright without one.
- Verified on the Polar sandbox (API 2026-10): `GET /v1/subscriptions/` and `GET /v1/orders/` with an unknown `external_customer_id` return `200` with `total_count: 0`. `GET /v1/customers/external/{id}` returns `404 {"error":"ResourceNotFound"}`. So Billing, invoices and `ensureCheckoutAllowed` work for a user with no customer.
- Polar docs: a successful checkout with `external_customer_id` creates the customer if none exists. Customer `email` and `external_id` are each unique per organization, and `external_id` can't change once set.
- SDK `@polar-sh/sdk` 1.0.2 (`/2026-10`): `getExternalCustomers`, `createCustomers`, `listCustomers({ email })`, `updateCustomers(id, …)`, `updateExternalCustomers(externalId, …)` and `deleteExternalCustomers(externalId, { anonymize })`. `polarClient` (`createPolar`) and `polarCore` (`createPolarCore`, used by the plugin) are separate instances: a spy on one doesn't see calls on the other.
- `polarFailureOf` / `describePolarError` in `Sinwy.Backend/infrastructure/polar/polarErrors.ts` already split Polar failures into rejected (4xx) and unavailable (5xx, timeout, network), and log without bodies. Client timeout is 5 s.
- Every `authClient` caller shows errors through `authErrorMessage(error)` (`WebFrontend/src/shared/lib/auth/auth-error.ts`, no fallback parameter): the message for status < 500 or a code in `AUTH_ERROR_CODES`, otherwise "Something went wrong. Try again in a moment." A new code must go into `AUTH_ERROR_CODES` to survive at 5xx, both there and in the backend rewrite (`modules/auth/routes.ts`). Code-specific UI (a field error) branches on `error.code` before calling it.
- The plugin logs Polar's raw error text, response body included, through Better Auth's logger (`ERROR [auth] Polar checkout creation failed. Error: … 401 - "{…}"`), for checkout, portal and the customer hooks. It never reaches the client. Better Auth also logs `INFO [auth] Sign-up attempt for existing email: <address>`. Both are for phase 4 (log entry, phase 1).
- `bun run dev:seed-scenario` signs up through `auth.api.signUpEmail` (`scripts/dev/seedScenario.ts`), so Default 6's "seeds insert rows directly" doesn't hold for it: until phase 2 it needs a working Polar token, and in phase 3 its `@gmail.com` addresses go through the real DNS check.
- E2E stand-in for a failing Polar: `POLAR_ACCESS_TOKEN=polar_invalid_e2e bun run start:server` (a set env var beats `.env`). Polar answers 401 `invalid_token`, the checkout guard fails open with a WARN, and the plugin answers 500.
- `stubPolarCore` takes a `Response` as a canned value, for non-200 Polar answers (404, 422, 5xx).
- `example.com` publishes a null MX (RFC 7505), so a correct check refuses it. Test and seed emails mostly use `@sinwy.test` and `@test.dev`.

---

## Phase 2: Own the Polar customer lifecycle

**Goal:** Sign-up makes no Polar call. The customer is created on demand before checkout and the portal, kept in sync on user update, and deleted and anonymized with the user.

**Files:**
- `Sinwy.Backend/modules/auth/auth.ts`: `polar({ createCustomerOnSignUp })`, `hooks.before` (the `/checkout` branch; add `/customer/portal`), `databaseHooks.user.update`, `user.deleteUser.afterDelete`.
- `Sinwy.Backend/modules/auth/deletedUserCleanup.ts` (`cleanupDeletedUser`; its doc comment says the plugin deletes the customer).
- New `Sinwy.Backend/modules/billing/customer.ts`, exported through `modules/billing/index.ts`.
- `Sinwy.Backend/modules/billing/polar.ts` (`toPolarFailure`), `Sinwy.Backend/infrastructure/polar/polarClient.ts` (remove the `buildRequest` override, Default 8, and its doc comment), `infrastructure/polar/polarErrors.ts`.
- `Sinwy.Shared/types/auth/Auth.ts`: add `BILLING_UNAVAILABLE` and `BILLING_ACCOUNT_REJECTED` to `AUTH_ERROR_CODES`; that alone lets the 503 through `modules/auth/routes.ts` and `authErrorMessage`, so the frontend callers (`openPolarPortal`, `choosePlan`, `checkoutForTransfer`) need no change.
- Tests: `Sinwy.Backend/test/helpers.ts` (`stubPolarCore`, `cannedPolarResponse`: its default `GET /v1/customers/` answer and the doc comment about sign-up sync, and the comment at line 15 explaining why sessions are forged), `modules/auth/tests/deleteUserCallback.test.ts` (asserts the customer delete through the `polarCore` spy), `modules/auth/tests/userUpdateHook.test.ts`, `modules/billing/tests/billing.test.ts` (plugin checkout tests near the end; add portal ones there).
- `Sinwy.Backend/scripts/dev/seedScenario.ts`: signs up, so it stops creating a Polar customer; check nothing in the e2e toolkit relies on one existing.
- Docs: `docs/org-rules-map.md` §11 (deletion: "anonymized (Default 2)" line), §12 ("one customer per user"), §13 (new codes).

**Steps:**
- `ensurePolarCustomer(user)` in billing: fetch by external id. On 404, mirror the plugin's lookup by email (see Standing notes) and then create. Treat a 422 `external_id` conflict on create as a concurrent ensure and re-fetch. If the customer exists but its email or name differs, update it (Default 4).
- Failure mapping: Polar unavailable gives `APIError` 503 `BILLING_UNAVAILABLE`. Polar rejected, or the email is linked to another customer, gives 409 `BILLING_ACCOUNT_REJECTED`, logged at error level with the user id. Use `polarFailureOf` and `describePolarError`, never the raw message.
- In `hooks.before`, run the ensure on `/checkout` after `ensureCheckoutAllowed` succeeds, and on `/customer/portal`, both with the session user. Put no Polar call in the sign-up path.
- Set `createCustomerOnSignUp: false`, and replace its other two hooks:
  - `syncPolarCustomer` on `databaseHooks.user.update.after`: best effort (Default 5).
  - `deletePolarCustomer(userId)` from `cleanupDeletedUser`: `anonymize: true`, a 404 is fine, other failures are logged. This keeps the guarantee in §11: the customer keeps the deleted user's id as its external id, so its late webhooks hit an unknown user.
- Users created before this change already have a customer; the ensure finds it by external id. There is no migration.
- Fix the stale comment in `test/helpers.ts`. Sessions may stay forged.

**Tests that matter:**
- Sign-up through `auth.api.signUpEmail` makes zero Polar requests, on both clients.
- Ensure: existing customer, no-op; existing with stale email, updated; none, created with the user's email, name and id; unlinked customer with the same email, linked; customer with that email linked elsewhere, `BILLING_ACCOUNT_REJECTED`; create race (422 on `external_id`), succeeds; Polar 5xx or timeout, `BILLING_UNAVAILABLE`, and no checkout is created.
- Checkout and portal are refused when the ensure fails, and the checkout guard still runs first (a user with a plan gets `PLAN_EXISTS` without any customer call).
- User deletion sends `DELETE /v1/customers/external/{id}?anonymize=true` once, also when the user never had a customer (404 swallowed).
- User update calls `updateExternal` with the new email and name, and a 404 doesn't fail the update.

**Done when:**
- With Polar unreachable, email sign-up, verification and login all succeed.
- Checkout and the portal work for a user who signed up while Polar was down.
- `bun run verify` passes and `docs/org-rules-map.md` describes the new lifecycle.

**Verify:** Seed nothing. Start the stack with the backend's Polar access token pointing at an unreachable host, or with Polar calls stubbed to fail. Sign up through the form: the "check your inbox" screen appears, the `user` row exists, the verification email is sent, and no Polar customer exists. Verify the email from the sent-mail log and land logged in. Restore Polar (sandbox) and choose a plan on Account → Billing: a Polar sandbox customer with `external_id` = the user's id and the account email now exists, and the checkout opens with the email locked. Break Polar again and click "Manage in Polar": the page shows the `BILLING_UNAVAILABLE` message. Finally delete the account through the emailed link: the sandbox customer is anonymized. Polar webhooks are simulated by the e2e toolkit.

---

## Phase 3: Reject email domains that can't receive mail

**Goal:** Sign-up and email change refuse a domain with no mail route, with "Enter a valid email" on the email field, without ever blocking on DNS trouble.

**Files:**
- New `Sinwy.Backend/modules/auth/emailDomain.ts`.
- `Sinwy.Backend/modules/auth/auth.ts`, `hooks.before`: paths `/sign-up/email` (`ctx.body.email`) and `/change-email` (`ctx.body.newEmail`).
- `Sinwy.Backend/lib/appConfig.ts` (`NODE_ENV`: `dev | local | prod | test`).
- `Sinwy.Shared/types/auth/Auth.ts`: add `EMAIL_DOMAIN_INVALID`.
- Frontend: `src/modules/auth/lib/useRegister.ts` (`onSubmit`), `src/modules/account-dashboard/components/settings/EmailSection.tsx`.
- Docs: `docs/org-rules-map.md` §13 if account errors are listed there; otherwise only the code comment on `AUTH_ERROR_CODES`.

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
