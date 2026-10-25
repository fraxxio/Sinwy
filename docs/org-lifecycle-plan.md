# Organization lifecycle plan

Gives an organization a full lifecycle around its single, fixed owner: suspend,
lapse, 30-day retention after owner deletion, transfer, and (later) restore.
Nothing is lost by accident, and nothing stays billed or publicly reachable
once an org is inactive. The one-owner rule shipped in #31.

From Phase 6 on, billing moves from one subscription per organization to one
plan per user, whose tier sets how many organizations the user can run
([org-billing-model-decision.md](org-billing-model-decision.md)).

Run a phase with the `implementation-phase` skill. Finished phases and their
logs are in [org-lifecycle-log.md](org-lifecycle-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 0 | Polar SDK and plugin upgrade | – | done | `feat(backend, web): upgrade Polar SDK 1.x, plugin 2.x and better-auth 1.7` |
| 1 | Inactive orgs are locked out | 0 | done | `feat(backend, web): lock inactive organizations out of the dashboard` |
| 2 | Suspend with Polar pause | 1 | done | `feat(backend, web): suspend and resume organizations with Polar pause` |
| 3 | Owner deletion and 30-day retention | 2 | done | `feat(backend, web): keep organizations 30 days after owner account deletion, then purge` |
| 4 | Ownership transfer | 3 | done | `feat(backend, web): transfer organization ownership to a member with a new checkout and prorated refund` |
| 5 | Booking payments investigation | – | done | `docs: decide on Stripe Connect direct charges for booking payments` |
| 6 | Account plan and organization slots | 4 | todo | |
| 7 | Account billing page and onboarding | 6 | todo | |
| 8 | Plan changes and the organization cap | 7 | todo | |
| 9 | Account-wide suspend, cancel and lapse | 7 | todo | |
| 10 | Transfer on the account plan | 8 | todo | |
| 11 | Code review | 0–10 | todo | |
| 12 | Organization and billing rules map | 11 and its fixes | todo | |

Phases 6 and 7 land back to back: Phase 6 removes the organization-scoped
billing endpoints the web app still calls until Phase 7.

## Decisions

Settled with the product owner. Ask before changing any of them. The billing
model ones come from
[org-billing-model-decision.md](org-billing-model-decision.md) (D1–D15).

- **Nobody opens an inactive org's dashboard.** The read-only lapsed dashboard
  and its banner go away. In the switcher, the owner's link to an inactive org
  goes to Account → Billing (Account → Organizations to activate it); for
  everyone else the entry is disabled.
- **One plan per user** (D1, D2). The subscription belongs to the user, not to
  an organization. One invoice per period, in one billing name. Polar's "Allow
  multiple subscriptions" stays off.
- **Fixed tiers with an organization cap** (D3): Starter 1, Professional 2,
  Enterprise 5. Every organization a user owns gets the owner's tier
  features. Members other than the owner never need a plan.
- **An organization is active when its owner's plan grants access and it
  holds one of the owner's slots** (D4). Only activated organizations count
  toward the cap. Scheduling an org for deletion frees its slot at once.
- **Creating an organization at the cap is allowed** (D5): it stays an
  inactive draft until the owner frees a slot or upgrades.
- **Downgrading below current usage is allowed** (D6): the user picks which
  organizations stay active, the rest become inactive. It takes effect at
  period end. Plan switching is off in the Polar customer portal; the app is
  the only place to change tier.
- **A freed slot is not filled automatically** (D7): the user activates the
  organization they want.
- **Suspend is account-wide** (D8): it pauses the plan, with the Phase 2 rules
  (pause at period end, undo before then, one-click resume, no refunds), and
  takes every owned organization offline together. Deactivating a single
  organization is free and only frees its slot.
- **Cancel, lapse and past due apply to every owned organization together**
  (D9). Cancel and suspend warn with the list of organizations affected.
- **One trial per user**, on the first plan (D10).
- **Only an existing member can receive a transfer.** The old owner stays on as
  admin. The transfer uses one of the recipient's slots and frees the old
  owner's (D11): a recipient with no plan buys one at acceptance; a recipient
  whose plan is full upgrades at acceptance. Nothing changes on the old
  owner's plan; they downgrade or cancel themselves (D12).
- **Owner account deletion** revokes the user's subscription and schedules
  every owned organization for the 30-day retention (D13).
- **No migration** (D14): production has no paying customers; the
  per-organization model is replaced outright.
- **Inside an organization, admins see the tier name only** (D15). Plan,
  invoices, payment method and every billing action live on the owner's
  Account → Billing.

Superseded by the billing model decision (kept for the shipped phases' logs):

- ~~One subscription per organization.~~ Replaced by one plan per user.
- ~~Suspension uses Polar pause per organization.~~ Polar pause stays, but on
  the account's plan (D8).
- ~~Transfer starts a new subscription; the old one is revoked and refunded
  prorated.~~ Replaced by slots (D11, D12).

### Defaults

7–11 are confirmed by the product owner; ask before changing them. 1–6 are
not yet confirmed; change them only if asked.

1. An owner deleting the org on purpose (Better Auth `deleteOrganization`)
   stays an immediate hard delete and frees its slot. Only owner *account*
   deletion gets the 30-day window.
2. The Polar customer is deleted with `anonymize: true`.
3. Pause, cancel and plan switching stay off in the Polar customer portal
   where Polar allows it. A plan still canceled through the portal ends up
   lapsed and goes through a new checkout.
4. A trialing plan can't be paused (Polar only pauses `active`), so Suspend is
   disabled during a trial.
5. Drafts and inactive orgs never expire; only orgs scheduled for deletion
   are purged.
6. Restore (later) will need a new owner chosen from the remaining members.
   Nothing about the deleted user is kept.
7. Upgrades take effect immediately, prorated (D6 covers only downgrades).
8. A slot survives a lapse or pause: when the plan grants access again, the
   same organizations are active.
9. Whenever the cap ends up below the active count without the user's picks
   (a downgrade applied outside the app, or a new plan with a lower cap after
   a lapse), the earliest-activated organizations keep their slots and the
   owner gets an email naming the ones that went inactive.
10. Finishing onboarding takes a free slot when the owner has one. That is a
    new organization, not a freed slot, so D7 doesn't apply.
11. A recipient who bought or upgraded a plan at acceptance keeps it if the
    transfer is canceled or expires before it completes; nothing is refunded.

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them
again. Each phase prunes this list when it finishes.

Polar SDK and plugin (log: Phase 0):
- Take Polar types and errors only from `infrastructure/polar` (`polarClient`,
  `polarCore`, `PolarModels`, `PolarApiErrors`). SDK 1.x returns raw JSON:
  snake_case, ISO date strings (wrap in `new Date()`), no runtime validation.
  Webhook `validateEvent` checks only the signature and event type.
- Ids are positional: `subscriptions.update(id, body)`, `get(id)`,
  `revoke(id)`. Paging: `subscriptions.iterList`; tests stub it with
  `polarPages(...)`.
- Errors: `PolarClientError` (4xx, parsed body on `.error`; tell union members
  apart by `error.error.error`), `PolarServerError`, `PolarNetworkError`.
  Polar's pause refusals are untyped 409s; re-read the subscription to explain
  a refusal instead of mapping names.
- Tests that sign up, update or delete users, or hit plugin endpoints, must use
  `stubPolarCore()` from `test/helpers`, or they reach the sandbox.
- Plugin 2.x bodies are snake_case (`reference_id`); a bad webhook signature
  answers 403. Keep `experimental_organizationSync` off.
- Each user is one Polar customer with `external_id` = user id
  (`createCustomerOnSignUp`). From Phase 6 the subscription is tied to the
  user through that customer, not through `referenceId` metadata.
- The plugin deletes the Polar customer on user delete; `polarCore` adds
  `anonymize=true` to it. Don't add a second delete (log: Phase 3).
- better-auth 1.7 requires a fresh session for `unlinkAccount`.

Polar sandbox (log: Phase 2):
- Polar charges asynchronously: resume answers `active` at once and the
  `subscription_cycle` order comes 15 minutes later; a failed charge arrives
  as a later `past_due` webhook.
- The portal always allows cancel at period end, and
  `cancel_at_period_end: true` replaces a pending pause.
- `allow_multiple_subscriptions` is **false** in the sandbox org (`sinwydev`)
  and stays off (D1). Production is a separate Polar org; check it there too.
- Turning off plan switching in the customer portal (D6) is a Polar setting in
  sandbox and production; ask the user before changing either.
- Refund `amount` is net of tax; Polar refunds the matching tax itself. Use
  the helpers in `modules/billing/refunds.ts` (log: Phase 4).
- The sandbox webhook endpoint (`75e9e523…`) is disabled: no real deliveries,
  simulate them. Re-enabling it (ngrok) needs the user. The
  `subscription.paused` fixture is derived; capture real fixtures once it's on.

App state (log: Phases 1–4):
- Public pages, booking pages and custom-domain resolution must go through
  `isOrganizationPublic(org)`.
- One code, `ORGANIZATION_INACTIVE`, covers inactive and scheduled orgs.
- Members' backend reads of an inactive org still answer, writes answer 409.
  A scheduled org is hidden from everyone: `resolveMembership` returns null.
- Revoking must cover paused subscriptions too: the billable list is
  entitled plus `paused`, or a paused subscription with `resumes_at` charges
  later.
- Owner account deletion runs `scheduleOrganizationsForDeletion` (one
  transaction), which also cancels open transfers. Invitations the owner
  sent are cascade-deleted, not canceled.
- Better Auth's `/organization/leave` fires no `afterRemoveMember`; a
  `hooks.after` covers it (log: Phase 4).
- Ownership swaps go through `swapOwner` (locks both member rows, demotes,
  then promotes; the one-owner index needs that order).
- Jobs: add a `Job` to `startJobs` in `Sinwy.Backend/index.ts`; the name is
  the advisory lock key. Self-heal queries skip rows younger than 1 hour,
  because better-auth writes the org and its owner member separately.
- Better Auth's `beforeDelete` organization hook revokes the org's
  subscription today (`modules/auth/auth.ts`). Under the account plan it must
  only free the slot.
- The onboarding page reads the org with `getFullOrganization` and never
  calls `setActive`.
- Web helpers for the org list and closed-org rules live in
  `shared/lib/organizations.ts`. `AppShell`'s `banner` slot is free for
  notices.
- e2e: file URLs use the `BETTER_AUTH_URL` origin (`localhost:3000` locally);
  `keyFromFileUrl` silently ignores any other origin.
- e2e: `/checkout/success` activates a plain checkout from Polar on its own,
  so its `subscription.active` needn't be simulated. Polar's card fields sit
  in Stripe iframes: type through `run-code` with
  `frameLocator('iframe[name^="__privateStripeFrame"]')` and
  `pressSequentially` (log: Phase 4).

Open, not caused by this plan:
- The plan-change dialog shows USD catalog prices while Polar charges EUR.
- `invite-member` accepts `role: "member"`, which isn't an app role.
- A set-active refusal thrown in `hooks.before` is logged by Better Auth at
  ERROR level, though it's a user-caused 403.

---

## Phase 6: Account plan and organization slots

**Goal:** the subscription belongs to the user, and an organization is active
when its owner's plan grants access and it holds one of the owner's slots.
Backend only; the web billing pages follow in Phase 7.

**Files:** `Sinwy.Backend/db/schema/{organizationSchema,userSchema}.ts`,
`modules/billing/{projection,checkoutGuard,service,controller,routes,invoices,transfer}.ts`,
`modules/organizations/{service,repository,purge}.ts`,
`modules/auth/{auth,requireFeature,requirePermission,activeOrganization}.ts`
(`beforeDelete`, `resolveMembership`, set-active refusal),
`modules/transfers/service.ts` (`completeOrganizationTransfer`,
`transferOwnershipBySupport`), `Sinwy.Backend/scripts/transferOrganization.ts`,
`scripts/backfillSubscriptionBindings.ts` (delete),
`scripts/dev/{seedScenario,simulatePolarWebhook,capturePolarFixture}.ts`,
`Sinwy.Shared/types/{plan,organization}/`, `.agents/skills/e2e-test/`.
Tests: `modules/billing/tests/{projection,checkoutGuard,billing,planFeatures}.test.ts`,
`modules/transfers/tests/transfer.test.ts`.

Data:
- Table `user_subscription` (billing module): `user_id` (PK, cascade),
  `subscription_id` (unique), `plan`, `status`, `subscription_status_at`,
  `trial_used_at`, timestamps. `plan` only while entitled, as on the org
  today.
- `organization.slot_held_at` (nullable): set while the org holds a slot.
- Drop `organization.status`, `plan`, `subscription_id` and
  `subscription_status_at` with their checks (D14: no data migration).
- `PLAN_ORGANIZATION_LIMITS` in `@sinwy/shared` (Starter 1, Professional 2,
  Enterprise 5).

Projection:
- Find the user by the subscription's `customer.external_id`; ignore
  `referenceId`. Keep the ordering guard (`subscription_status_at`), the
  entitled and billable lists, and the paused rule (inactive, binding kept).
- A second billable subscription for a user who already has one (a race past
  the checkout guard) is revoked and refunded in full with `refundInFull`.
- Drop `projectTransferSubscription`, the transfer checkout, the stray and
  old-subscription refunds, and `reconcileInactiveOrganization`'s org lookup;
  reconcile now runs per user.

Derived status:
- One repository read returns an org's access: holds a slot, not scheduled,
  owner's plan entitled, owner's plan slug. `isOrganizationPublic`,
  `resolveMembership`, `requireFeature` (owner's plan), the set-active
  refusal and `getOrganizationStatus` read it. `ORGANIZATION_INACTIVE`
  stays the single code.

Slots:
- `POST /api/account/organizations/:organizationId/activate` and
  `.../deactivate`, owner only. Activate locks the owner's
  `user_subscription` row, counts held slots of non-scheduled owned orgs and
  refuses at the cap (`ORGANIZATION_LIMIT_REACHED`) or without an entitled
  plan.
- Scheduling for deletion and Better Auth's `beforeDelete` clear the slot and
  no longer touch Polar for that org.
- Owner account deletion revokes the user's subscription (billable list),
  then schedules every owned org (D13).

Checkout:
- The checkout carries no `reference_id`. The guard refuses when the user
  already has a billable subscription (`PLAN_EXISTS`: change the plan
  instead) and strips the trial when `trial_used_at` is set (D10). Check in
  the Polar docs how a checkout disables a product's trial.

Transfers (until Phase 10):
- Completion is a role swap plus a slot move in one transaction: lock both
  owners' `user_subscription` rows in id order, clear the old owner's slot,
  give the recipient one. Accept refuses with `RECIPIENT_NEEDS_PLAN` when
  the recipient has no entitled plan or no free slot. No money moves (D12).
- The support script swaps roles; the org keeps a slot only if the recipient
  has one free, otherwise it stays inactive. No refund.

Tests that matter:
- Two concurrent activations at the cap: exactly one wins.
- Projection: by customer, out-of-order events, paused keeps the binding, a
  second subscription for the same user is revoked and refunded.
- An org with a slot is inactive while the owner's plan is paused, lapsed or
  missing, and active again when it grants access.
- Scheduling and hard delete free the slot; account deletion revokes once.
- Transfer completion moves the slot and keeps exactly one owner.

Done when:
- With a real sandbox checkout (no org): the user's plan projects, an org
  activates, a second org at the Starter cap is refused, deactivating the
  first frees the slot, and the second then activates. Checked against the
  running backend.

**Verify:** start from `owner-with-org` with a second org created through the
API. Pay a real Starter checkout through the plugin's `/checkout` with no
`reference_id`; `/checkout/success`'s reconcile or a simulated
`subscription.active` (extend `dev:simulate-polar-webhook` to take
`--user`) projects it. Then the activate/deactivate calls above, checking
`user_subscription` and `organization.slot_held_at` with `psql`, and a public
page of each org via `isOrganizationPublic`. Simulate `subscription.paused`
and `subscription.revoked` and check both orgs go inactive.

## Phase 7: Account billing page and onboarding

**Goal:** the owner manages their plan, slots and invoices from the account,
and a new organization activates without its own checkout when a slot is
free.

**Files:** `Sinwy.WebFrontend/src/modules/account-dashboard/routes/`
(new `_shell.billing.tsx`, `_shell.organizations.tsx`),
`src/modules/org-dashboard/components/billing/` (move what's reused to the
account module, delete the rest), `src/modules/org-dashboard/routes/_shell.settings.billing.tsx`
(delete), `src/modules/org-dashboard/lib/{billing-queries,plan-change}.ts`,
`src/modules/organizations/routes/{$id.plan,$id.onboarding}.tsx`,
`src/modules/organizations/lib/preselected-plan.ts`,
`src/modules/checkout/routes/success.tsx`,
`src/modules/auth/lib/post-login.ts`, `src/shared/lib/{organizations,plans}.ts`,
`src/shared/components/shell/OrganizationSwitcher.tsx`,
`Sinwy.Backend/modules/billing/{service,controller,routes,invoices}.ts`
(account-scoped reads), `modules/organizations/service.ts` (funnel),
`Sinwy.Shared/types/organization/FunnelStep.ts`. Tests:
`src/shared/tests/{organizations,plans}.test.ts`,
`src/modules/auth/tests/post-login.test.ts`.

Backend:
- `GET /api/account/subscription` (plan, status, period end, cap, slots
  used) and `GET /api/account/invoices` (+ download), replacing the
  organization-scoped ones.
- The organization payload gives admins the tier name only (D15); staff get
  none.
- Funnel: create → select plan (only without an entitled plan) → pay. With an
  entitled plan, finishing onboarding takes a free slot (Default 10); at the
  cap the org stays a draft.

Frontend:
- Account → Billing: current plan with "{n} of {cap} organizations active",
  plan cards and checkout when there is no plan, invoices, and the portal
  link for the payment method.
- Account → Organizations: each owned org shows active, inactive or draft,
  with Activate / Deactivate. At the cap, Activate is disabled with an
  upgrade link.
- Onboarding: at the cap, a notice that the org stays a draft until a slot is
  free, linking to Account → Billing.
- Org settings: the tier name for admins; no billing pages. The switcher and
  post-login send the owner of an inactive org to Account → Organizations.
- `/checkout/success` waits for the user's plan instead of an org.

Tests that matter:
- The funnel step for each combination of plan, free slot and onboarding
  state.
- Switcher and post-login targets for drafts, inactive orgs and scheduled
  orgs.

Done when:
- Sign up → create org → pay → active; create a second org on Starter →
  stays a draft; deactivate the first, activate the second. An admin sees the
  tier name and nothing else. Checked in the running app.

**Verify:** `user` scenario, real sandbox checkout from onboarding, then the
flow above in the browser. Add a staff member through `org-with-staff` and
check their settings show no billing and no tier. Old URLs
(`/<org>/settings/billing`, `/organizations/<id>/plan`) answer 404 or
redirect to Account → Billing.

## Phase 8: Plan changes and the organization cap

**Goal:** the owner upgrades at once and downgrades at period end, choosing
which organizations stay active when the new cap is lower.

**Files:** `Sinwy.Backend/modules/billing/{service,projection,controller,routes}.ts`
(`changeOrganizationPlan` becomes an account plan change),
`modules/organizations/{service,repository}.ts`, `db/schema/userSchema.ts`
(pending downgrade), `Sinwy.Backend/lib/jobs.ts` and `index.ts` if a job
applies the downgrade, a new email under `modules/billing/`,
the Account → Billing change-plan dialog. Tests:
`modules/billing/tests/billing.test.ts`, `src/modules/org-dashboard/tests/plan-change.test.ts`
(move with the dialog).

Backend:
- Upgrade: `subscriptions.update` with the new product, prorated (Default 7).
- Downgrade: the request carries the organizations to keep active, at most
  the new cap. Check in the Polar docs whether a product change can be
  scheduled for the period end. If not, store the pending downgrade on
  `user_subscription` and apply it at `current_period_end` from a job, then
  clear it. The owner can cancel a pending downgrade before then.
- When the downgrade lands, unpicked orgs lose their slots in the same
  transaction as the projection.
- Any projected cap below the active count without picks: Default 9 (keep
  the earliest-activated, email the owner).
- Refuse plan changes while a pause or cancel is pending, or a transfer is
  accepted and waiting on this user's checkout.
- Turn off plan switching in the Polar customer portal (ask first; standing
  notes).

Frontend:
- Change-plan dialog on Account → Billing. A downgrade below the active count
  asks which organizations stay active and states the date it takes effect.
  A pending downgrade shows on the page with Cancel.

Tests that matter:
- Downgrade with picks: the right orgs keep their slots at period end, not
  before.
- Out-of-band downgrade and resubscribe at a lower cap follow Default 9.
- Upgrade then activate up to the new cap.

Done when:
- Professional with two active orgs → downgrade to Starter keeping the second
  → both stay active until the period end (simulated) → only the second is
  active. Upgrade back → activate the first. Checked in the running app.

**Verify:** real sandbox Professional checkout, two activated orgs. The
period end can't be waited for: simulate the `subscription.updated` (or run
the job with the period end moved in the database) and check slots with
`psql` and the switcher in the browser. Simulate an out-of-band Starter
`subscription.updated` and check the email (`dev:last-email`).

## Phase 9: Account-wide suspend, cancel and lapse

**Goal:** suspend, resume and cancel act on the user's plan, and the owner
sees which organizations go offline before confirming.

**Files:** `Sinwy.Backend/modules/billing/{service,controller,routes}.ts`
(`suspendOrganization`, `unsuspendOrganization`, `resumeOrganization` become
account actions), `modules/organizations/service.ts` (`isSuspended` derives
from the owner's plan), the Account → Billing page and the moved
`SuspendSection.tsx`, `src/shared/lib/plans.ts` (`describeSubscription`).
Tests: `modules/billing/tests/billing.test.ts`.

Backend:
- `POST /api/account/subscription/{suspend,unsuspend,resume}` with the Phase 2
  refusals (trialing, past due, pending pause or cancel) and responses.
- `GET /api/account/subscription` lists the orgs that would go offline.
- Cancel at period end from the app (`cancel_at_period_end: true`) with
  undo; the portal's cancel ends the same way.

Frontend:
- Suspend and Cancel dialogs list the organizations affected and the date
  (D9). Past due shows a payment warning on Account → Billing and in each
  owned org's `AppShell` banner for the owner.

Tests that matter:
- Each refusal; resume after a failed charge reports `past_due`.
- Suspend and cancel take every owned org offline at period end; resume
  restores the same slots (Default 8).

Done when:
- Suspend → period end (simulated) → all owned orgs locked out → resume →
  the same orgs active. Cancel with undo. Checked in the running app,
  including a staff member's view of a suspended org.

**Verify:** real sandbox subscription with two active orgs. Suspend in the
browser, simulate `subscription.paused`, check both orgs locked for owner and
staff, resume (real Polar call), check `active`. Cancel, undo, then cancel
and simulate `subscription.canceled`/`revoked`.

## Phase 10: Transfer on the account plan

**Goal:** a recipient without a plan buys one at acceptance, and a recipient
whose plan is full upgrades at acceptance; then the organization moves to
their slot.

**Files:** `Sinwy.Backend/modules/transfers/{service,controller,routes,repository}.ts`,
`modules/billing/{service,transfer,refunds}.ts` (delete what's left of the
transfer checkout), `db/schema/organizationSchema.ts`
(`organization_transfer`: drop `old_subscription_id`, `new_subscription_id`,
`settled_at` if unused), `modules/transfers/emails/`,
`src/modules/account-dashboard/routes/_shell.organizations.tsx`,
`src/modules/checkout/routes/success.tsx`. Tests:
`modules/transfers/tests/transfer.test.ts`.

Backend:
- Accept, by the recipient's state:
  - free slot: complete at once (Phase 6 completion);
  - no plan: a plan checkout (recipient picks the tier, trial rules as any
    first plan) carrying `transferId` in metadata; the projection completes
    the transfer once the plan is entitled;
  - full: an upgrade to a tier with room (Phase 8 upgrade), then complete.
- If the transfer is no longer `accepted` when the plan arrives, the
  recipient keeps the plan (Default 11).
- The old owner's plan doesn't change (D12); the completion email says the
  slot is free.
- Offers still refuse inactive, suspended and scheduled orgs.

Frontend:
- Account → Organizations: Accept shows what happens (uses a free slot, buy a
  plan, or upgrade to a named tier) before confirming.

Tests that matter:
- Each recipient state; a recipient who removes the slot (activates another
  org) between accept and checkout ends up upgrading, not over the cap.
- Old owner keeps their plan and gets the slot back.

Done when:
- Transfer to a staff member with no plan → plan checkout → owner; transfer
  to one at the cap → upgrade → owner. Checked in the running app.

**Verify:** `org-with-staff`, owner on a real sandbox plan. Offer to staff;
as staff accept → real sandbox checkout; simulate the `subscription.active`
with `--transfer-id`. Check roles, slots and both plans with `psql`. Repeat
with a staff member who owns an active org on Starter.

## Phase 11: Code review

**Goal:** an independent pass over everything this plan changed, to find bugs
and weak spots before the work is considered done. **Investigate, verify and
report only. Don't fix anything in this phase.**

**Verify:** none; the report is the output. Read the log file for the
phases' details here, since this phase reviews them.

Scope: the full diff from the commit before Phase 0 to the last phase commit
(including `modules/transfers/`, `modules/billing/` and the account billing
pages), plus older code these changes rely on or touch (projection, checkout
guard, account deletion, membership guards, switcher, post-login).

Check for:
- **Bugs**, new or left over: races (webhooks against user actions, two server
  instances, double submits, two activations past the cap), wrong state
  transitions, money paths that can double-charge, skip a refund or leave a
  subscription billing a deleted account, missing authorization, and data
  that can be lost before the 30 days are up.
- **Test honesty and correctness:** tests that pass for the wrong reason
  (asserting on mocks rather than behaviour, no assertion on the outcome,
  fixtures that don't match real Polar payloads), and risky paths with no test.
- **Test value:** flag tests that only exercise low-risk, low-importance code
  for the sake of coverage, and the high-risk behaviour that has no test
  instead.
- **Code style:** the rules in `CLAUDE.md` (module boundaries, Zod DTOs,
  Drizzle types never exposed, functional services, comment rules, Biome).
- **Tech debt** that makes the system unreliable, hard to reason about, or hard
  to migrate as the app grows: state spread across tables that can disagree,
  logic duplicated between frontend and backend, the job runner, hidden
  coupling between modules, leftovers of the per-organization billing model,
  and schema choices that will be costly to change.

Every finding must be verified: reproduce it, point to the exact lines, or
show the failing input. Drop anything that doesn't hold up.

Output: `docs/org-lifecycle-review.md`, findings grouped by severity
(**Critical**, **High**, **Medium**, **Low**). Each finding has:
- a title and `file:line`,
- what is wrong and how it was verified,
- the concrete failure scenario and why it matters,
- a suggested direction for the fix (not the fix itself).

End the report with a short list of what was checked and found sound, so the
reader knows the coverage. Commit the report with the plan and log updates.

## Phase 12: Organization and billing rules map

**Goal:** one document that states every business rule for organizations and
their billing, so the product owner and agents can look up how something
should work without reading the code. Runs last, once the code review's
fixes are committed. Documentation only; no code changes.

**Files:** new `docs/org-rules-map.md`; `docs/user-flow-map.md` (§4–§8);
`CLAUDE.md` (one pointer line). Sources: the code (the source of truth), this
plan's Decisions and Defaults,
[org-billing-model-decision.md](org-billing-model-decision.md), the log and
the review report.

Format: like `docs/user-flow-map.md`. Numbered sections, each a short
`text` tree of conditions → outcomes, cross-referenced as `[n]`. Describe
behaviour as the user and the owner see it: states, who can do what, what
happens and when. Leave out implementation details (tables, function names,
Polar API calls), except a one-line "Enforced in" with module paths at the end
of each section, so agents can find the code. Prose only where a tree can't
say it.

Sections:
1. Terms: owner, admin, staff; plan, tier, cap, slot; active, inactive,
   draft, suspended, lapsed, scheduled for deletion.
2. Roles: one owner per org, what admins and staff can do, who sees billing
   (owner's account only; admins see the tier name).
3. Organization states and every transition between them, with its trigger.
4. Creating an organization and onboarding: with no plan, with a free slot,
   at the cap.
5. The account plan: tiers, caps, features per tier, the one trial.
6. Slots: what counts toward the cap, activating, deactivating, freed slots.
7. Plan changes: upgrade, downgrade with picks, pending downgrade, the cap
   dropping without picks.
8. Suspend, resume, cancel, lapse and past due.
9. What an inactive org means: dashboard lockout, public and booking pages,
   members' reads and writes, the switcher and post-login routing.
10. Ownership transfer: offer, accept for each recipient state, decline,
    cancel, expiry, what both owners' plans do.
11. Leaving and removal, deleting an org, owner account deletion, the 30-day
    retention and the purge.
12. Polar's part: what lives in Polar and what in the app, webhooks as the
    source of truth, the portal settings.
13. User-facing errors: each API error code a rule produces and when.

Steps:
- Write each rule from the code and its tests, then compare it with the
  Decisions and Defaults. Where they disagree, write what the code does,
  mark it **Differs from decision** with both versions, and list it in the
  log. Don't fix the code here.
- Trim `docs/user-flow-map.md` §5–§8 to the user's path through the screens
  and link to the rules map for the rules, so the two don't drift. Fix
  anything there the billing model made wrong (`referenceId`, plan page,
  per-org suspend).
- Add a line to `CLAUDE.md` pointing to `docs/org-rules-map.md` as the
  reference for organization and billing behaviour, to be updated with any
  change to those rules.

Done when:
- Every Decision and Default in this plan appears in the map or is marked as
  differing, and every section has its "Enforced in" line.

**Verify:** no app run. For each section, check two or three rules against
the tests that cover them, and name any rule with no test in the log.
