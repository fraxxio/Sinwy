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
| 6 | Account plan and organization slots | 4 | done | `feat(backend): move billing to one plan per user with organization slots` |
| 7 | Account billing page and onboarding | 6 | done | `feat(backend, web): move billing to Account → Billing with organization slots and drafts` |
| 8 | Plan changes and the organization cap | 7 | done | `feat(backend, web): schedule downgrades for the period end with organization picks` |
| 9 | Account-wide suspend, cancel and lapse | 7 | todo | |
| 10 | Transfer on the account plan | 8 | todo | |
| 11 | Code review | 0–10 | todo | |
| 12 | Organization and billing rules map | 11 and its fixes | todo | |

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
  (`createCustomerOnSignUp`). The subscription is tied to the user through
  `customer.external_id`; checkouts carry no `reference_id`, and Polar lists
  (subscriptions, orders) filter by `external_customer_id`.
- Polar's customer delete cancels the customer's subscriptions at once, so a
  subscription for an unknown user is only logged (log: Phase 6).
- A better-auth `hooks.before` can return `{ context: { body } }` to change
  the body; the plugin's `/checkout` forwards `allow_trial`, which is how the
  one-trial rule (D10) strips the trial (log: Phase 6).
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
- Portal plan switching (D6) and pause are off in the sandbox
  (`customer_portal_settings.subscription.update_plan` / `pause: false`;
  dashboard: "Enable subscription plan changes"). The API can't change org
  settings; production needs the same switch in its dashboard (log: Phase 8).
- A plan change can be scheduled: `proration_behavior: "next_period"` sets
  `pending_update`, any later update discards it, `pending_update: null`
  clears it. To reach a period end in e2e, PATCH `current_billing_period_end`
  a minute ahead; Polar renews within seconds (log: Phase 8).
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
- Owner account deletion: `beforeDelete` revokes the user's billable
  subscriptions (`revokeAccountSubscriptions`), then
  `scheduleOrganizationsForDeletion` (one transaction) frees every owned
  org's slot and cancels open transfers. Invitations the owner sent are
  cascade-deleted, not canceled.
- Better Auth's `/organization/leave` fires no `afterRemoveMember`; a
  `hooks.after` covers it (log: Phase 4).
- Ownership swaps go through `swapOwner` (locks both member rows, demotes,
  then promotes; the one-owner index needs that order).
- Jobs: add a `Job` to `startJobs` in `Sinwy.Backend/index.ts`; the name is
  the advisory lock key. Self-heal queries skip rows younger than 1 hour,
  because better-auth writes the org and its owner member separately.
- An org's status is derived, never stored: spread `organizationAccess`
  (`db/organizationAccess.ts`) into the query and pass the row to
  `organizationStatusOf` / `isOrganizationPublic`. `Membership.plan` is the
  owner's plan while the org is active.
- Anything that hands out a slot (transfers in Phase 10) locks plan rows first with `lockPlan`, in user-id order, then org
  rows, and counts with `countHeldSlots`; that lock is what keeps two
  activations from passing the cap (log: Phase 6). Creation, a draft's
  wizard completion and Activate all go through `holdSlot` (log: Phase 7).
- The projection write (`writeUserSubscription`) settles slots under the
  plan lock: stored downgrade picks first, then any plan below the held
  count releases the latest-activated orgs and emails the owner (Default 9).
  A plan written as null (paused, lapsed) keeps every slot (log: Phase 8).
- Suspend or cancel while a downgrade is pending is untested against Polar;
  `cancel_at_period_end` and pause may interact with `pending_update`.
- A draft is derived, not stored: no slot, setup unfinished, not scheduled
  (`isDraft`, the summary's `draft`). An org activated before finishing setup
  reads as a draft again once deactivated (log: Phase 7).
- Transfers complete at once on accept (`completeTransfer`); the `accepted`
  status and the transfer's checkout and subscription columns are unused
  until Phase 10.
- `GET /api/account/subscription` reconciles a user without a plan from
  Polar, so a paid checkout projects when it is called; `/checkout/success`
  polls it, then activates the owner's oldest draft. The checkout body is
  strictly `{ slug, redirect }`, so nothing ties a checkout to an org
  (log: Phases 6, 7).
- Better Auth's org row has no status or plan. Status, tier name (owner and
  admin only, D15), features and `draft` come from `GET /api/organizations`;
  the org shell builds its entitlements from that summary (log: Phase 7).
- The onboarding page reads the org with `getFullOrganization` and never
  calls `setActive`; it serves active orgs and the owner's drafts.
- Web billing lives in `modules/account-dashboard/` (`components/billing/`,
  `lib/billing-queries.ts`, `routes/_shell.billing.tsx`); invalidate
  `subscriptionQuery` after anything that changes slots or the plan.
- Web helpers for the org list and closed-org rules live in
  `shared/lib/organizations.ts`. `AppShell`'s `banner` slot is free for
  notices.
- e2e: file URLs use the `BETTER_AUTH_URL` origin (`localhost:3000` locally);
  `keyFromFileUrl` silently ignores any other origin.
- e2e: the simulator's `subscription.updated` fixture is `canceled`; send
  an out-of-band plan change as `subscription.active --plan <slug>`.
- e2e: Polar's card fields sit
  in Stripe iframes: type through `run-code` with
  `frameLocator('iframe[name^="__privateStripeFrame"]')` and
  `pressSequentially` (log: Phase 4).

Open, not caused by this plan:
- The plan-change dialog shows USD catalog prices while Polar charges EUR.
- `invite-member` accepts `role: "member"`, which isn't an app role.
- A set-active refusal thrown in `hooks.before` is logged by Better Auth at
  ERROR level, though it's a user-caused 403. So are the checkout refusals.
- `/organizations/new` shows the Plan and Pay steps to a user who already
  has a plan; the transfer section's copy is from the per-org model (Phase
  10); Account → Organizations labels admins "Member" (log: Phase 7).
- drizzle-kit `generate` needs a TTY when one table drops and adds columns
  (rename prompt); generate the drops and the adds as two migrations.

---

## Phase 9: Account-wide suspend, cancel and lapse

**Goal:** suspend, resume and cancel act on the user's plan, and the owner
sees which organizations go offline before confirming.

**Files:** `Sinwy.Backend/modules/billing/{service,controller,routes}.ts`
(`suspendAccountPlan`, `unsuspendAccountPlan`, `resumeAccountPlan` and their
`/api/account/subscription/*` routes already act on the account through
`runSubscriptionAction`; add cancel and undo there, and the affected orgs to
`toSubscriptionDto`), `db/organizationAccess.ts` (`listHeldSlots`),
`Sinwy.Shared/types/plan/Subscription.ts` (`AccountSubscriptionDto`). Web:
`src/modules/account-dashboard/routes/_shell.billing.tsx`,
`components/billing/{SuspendSection,ResumePanel,CurrentPlanSection}.tsx`,
`lib/{billing-queries,subscription-status}.ts` (`describeSubscription`,
`suspensionBlocker`), and the org shell's `AppShell` `banner` for past due.
Tests: `modules/billing/tests/billing.test.ts`,
`src/modules/account-dashboard/tests/subscription-status.test.ts`.

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
- Plan changes refuse while a transfer is accepted and waiting on this
  user's checkout (moved here from Phase 8).

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
