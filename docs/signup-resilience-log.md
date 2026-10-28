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

### Log (2026-10-28, `feat(backend): own the Polar customer lifecycle`)
- Shipped: `modules/billing/customer.ts` with `ensurePolarCustomer` (lookup by external id; on 404 the plugin's email rules, then create; a 422 `external_id` conflict on create re-fetches; a stale email or name is updated), `syncPolarCustomer` (best effort, 404 ignored) and `deletePolarCustomer` (`anonymize: true`, 404 ignored), all through `polarCore`. `hooks.before` runs the ensure on `/checkout` after `ensureCheckoutAllowed` and the transfer check, and on `/customer/portal`. `createCustomerOnSignUp: false`; the sync is on `databaseHooks.user.update.after`, the delete in `cleanupDeletedUser`. The `buildRequest` override is gone. `BILLING_UNAVAILABLE` (503) and `BILLING_ACCOUNT_REJECTED` (409) are in `AUTH_ERROR_CODES`. Tests: `customer.test.ts` (ensure cases, 5xx, timeout, 429, delete 404), `signUp.test.ts` (no Polar request during sign-up on either client; verification and login with Polar unreachable), checkout and portal ensure in `billing.test.ts`, update sync and its 404, deleting a user with no customer.
- Differs from plan: `polarFailureOf` now counts a 429 as unavailable, not rejected, so a rate limit says "try again" rather than "contact support". This also affects the plan-action and invoice callers. The checkout ensure runs after the transfer check too, so a stale offer never reaches Polar. On a refusal Polar finds by email (linked elsewhere, team customer), the error is logged as `Polar customer email is taken` with a reason, not the address. The sync runs on every update as Default 5 says, so email verification sends one best-effort Polar call: the update hook gets the new row, not what changed. `stubPolarCore` takes per-route functions and defaults to "no customer". The seed scenario test now asserts no customer is created; the e2e skill references no longer say sign-up creates one.
- Checked in the running app (e2e; backend behind `HTTPS_PROXY=http://127.0.0.1:9` for "Polar down"): sign-up showed "Check your inbox", wrote the row, sent the email, and left no sandbox customer (404 by external id, none by email). Verification logged in, with one expected sync ERROR. With Polar restored, choosing Starter created the sandbox customer (account email, `external_id` = user id) and opened the checkout with the email field disabled. With Polar down, "Manage billing on Polar" (plan simulated by webhook) showed the `BILLING_UNAVAILABLE` message. Deleting through the emailed link worked, and the customer is gone from the API. A user with no customer deleted cleanly. No Polar body in the log. Not checked: that the deleted customer was anonymized rather than removed (the API hides deleted customers; the unit test asserts `anonymize=true`), a real Polar 5xx or timeout, a paid checkout, and the live portal page. Also found: a `@sinwy.test` address gets Polar's 422 at checkout (`BILLING_ACCOUNT_REJECTED`, correct), and Polar keeps the email and name on an open checkout after the customer is anonymized (Polar behaviour, it expires).


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

### Log (2026-10-28, `feat(backend, web): reject email domains that can't receive mail`)
- Shipped: `modules/auth/emailDomain.ts`, which is `refuseUndeliverableEmail` over `emailDomainAcceptsMail`. A non-null MX passes. A lone null MX is refused even when the domain has an A record. With no MX, an A or AAAA record passes. `ENOTFOUND`/`ENODATA` on every lookup means refused. Any other error, or the 2 s cap, lets the address through with a WARN that names only the domain and the reason. `.test` is skipped unless `NODE_ENV=prod`. `hooks.before` calls it for `/sign-up/email` (`body.email`) and `/change-email` (`body.newEmail`), before Better Auth's user lookup, and refuses with a 400 `EMAIL_DOMAIN_INVALID` "Enter a valid email". `EMAIL_DOMAIN_INVALID` is in `AUTH_ERROR_CODES`. Frontend: both forms branch on the code and call the new `showFieldError` helper, so the message sits under the email field. Tests: `emailDomain.test.ts` (NXDOMAIN, no records, MX with no address lookup, A only and AAAA only, null MX with an A record, SERVFAIL, ETIMEOUT, a hung lookup under fake timers, the 400 body, `.test` outside prod and in prod). `signUp.test.ts` now also covers a refused sign-up (no row, no email) and a refused email change (no confirmation, while an accepted change sends one).
- Differs from plan: there were no change-email tests to extend, so the change-email cases went into `signUp.test.ts`, which already has the server and outbox setup. The server field error is set as a form-sourced `onDynamic` error so that TanStack Form clears it on the next validation. Without that, it would stick and block the next submit. The trade-off is that editing any field clears it, not only the email field. Each refusal logs `ERROR [Better Auth]: Enter a valid email` through Better Auth's router `onError`, just as the existing hook refusals do. That is left for phase 4.
- Checked in the running app (e2e, real DNS): signing up with `newuser@no-such-domain-sinwy.invalid` showed "Enter a valid email" under the email field (`aria-invalid`), with no form-level error, no `user` row and no email. Editing the field cleared the error. `newuser@sinwy.test` reached "Check your inbox", with a row and a verification email. For the seeded gmail plus-alias user, changing the email to `x@gmail.con` showed the field error, left the email unchanged and sent no confirmation. Editing cleared that error too. There were no DNS warnings, so the lookups did not fail open. Not checked: the prod path where `.test` is looked up (unit-tested only), a real DNS outage (unit-tested only), and delivery through Resend with the hook in place.
