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
| 9 | Account-wide suspend, cancel and lapse | 7 | done | `feat(backend, web): suspend and cancel the account plan with the organizations affected and a past-due warning` |
| 10 | Transfer on the account plan | 8 | done | `feat(backend, web): take over an organization with a free slot, a new plan or an upgrade at acceptance` |
| 11 | Code review | 0–10 | done | `docs: review the organization lifecycle and account billing work` |
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
  a minute ahead; Polar renews, pauses or cancels within seconds, and a
  Billing page load projects it (log: Phases 8, 9).
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
- Anything that hands out a slot locks plan rows first with `lockPlan`, in
  user-id order, then org rows, and counts with `countHeldSlots`; that lock is what keeps two
  activations from passing the cap (log: Phase 6). Creation, a draft's
  wizard completion and Activate all go through `holdSlot` (log: Phase 7).
- The projection write (`writeUserSubscription`) settles slots under the
  plan lock: stored downgrade picks first, then any plan below the held
  count releases the latest-activated orgs and emails the owner (Default 9).
  A plan written as null (paused, lapsed) keeps every slot (log: Phase 8).
- Suspend, cancel and plan changes exclude each other: suspend and cancel
  refuse while a downgrade is pending (`PLAN_CHANGE_PENDING`), since any
  update drops Polar's `pending_update`; each refuses while the other is
  pending. Cancel and undo are `/api/account/subscription/{cancel,uncancel}`
  (log: Phase 9).
- `AccountSubscriptionDto.activeOrganizations` is the list of held slots
  (`{ id, name }`), the orgs a suspend, cancel or lapse takes offline;
  `freeSlots` counts it (log: Phase 9).
- Past due: `OrganizationSummary.paymentFailed` (owner only, from the stored
  status) drives the org shell's banner; Account → Billing's notice reads
  Polar's live status (log: Phase 9).
- A draft is derived, not stored: no slot, setup unfinished, not scheduled
  (`isDraft`, the summary's `draft`). An org activated before finishing setup
  reads as a draft again once deactivated (log: Phase 7).
- Transfer accept: free slot → completes; no plan → `accepted`, then the
  plan checkout carries `metadata.transferId` (Polar copies it onto the
  subscription, verified) and the projection completes it on any entitled
  delivery; full → 409 until the dialog's upgrade. The incoming offer has
  no tier (recipients can be staff, D15) (log: Phase 10).
- `GET /api/account/subscription` reconciles a user without a plan from
  Polar, so a paid checkout projects when it is called; `/checkout/success`
  polls it, then activates the owner's oldest draft, except after a
  transfer checkout (`&organization=<id>`), which waits for ownership. The
  checkout body is strictly `{ slug, redirect, transferId? }`; the hook
  accepts a `transferId` only for the caller's `accepted` transfer
  (log: Phases 6, 7, 10).
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
  an out-of-band plan change as `subscription.active --plan <slug>`. It has
  no `past_due` fixture: set `user_subscription.status` with `psql`.
- e2e: `page.ts` can't target a named `playwright-cli` session; switch users
  with close, open and `state-load` (log: Phase 9).
- e2e: Polar's card fields sit
  in Stripe iframes: type through `run-code` with
  `frameLocator('iframe[name^="__privateStripeFrame"]')` and
  `pressSequentially`; the card inputs (`number`, `expiry`, `cvc`) are in
  the frame whose `src` contains `elements-inner-accessory` (log: Phases 4, 10).

Open, not caused by this plan:
- The plan-change and accept-transfer dialogs show USD catalog prices while
  Polar charges EUR.
- `invite-member` accepts `role: "member"`, which isn't an app role.
- A set-active refusal thrown in `hooks.before` is logged by Better Auth at
  ERROR level, though it's a user-caused 403. So are the checkout refusals.
- `/organizations/new` shows the Plan and Pay steps to a user who already
  has a plan; Account → Organizations labels admins "Member" (log: Phase 7).
- Resume charges on one click with no confirm dialog, unlike suspend and
  cancel; the "Choose a plan" intro on Billing speaks of one organization
  even when several wait (log: Phase 9).
- A recipient with a pending downgrade can accept into a free slot; at the
  period end the downgrade releases the latest-activated org, the
  transferred one, and emails them (Default 9). Transfer completion through
  a real webhook delivery is unchecked (log: Phase 10).
- drizzle-kit `generate` needs a TTY when one table drops and adds columns
  (rename prompt); generate the drops and the adds as two migrations.

Code review (log: Phase 11):
- Findings are in [org-lifecycle-review.md](org-lifecycle-review.md) (M1–M3,
  L1–L9), not fixed yet. Phase 12 waits for their fixes, and no phase
  plans those fixes yet.

---

## Phase 12: Organization and billing rules map

**Goal:** one document that states every business rule for organizations and
their billing, so the product owner and agents can look up how something
should work without reading the code. Runs last, once the code review's
fixes are committed. Documentation only; no code changes.

**Files:** new `docs/org-rules-map.md`; `docs/user-flow-map.md` (§4–§8);
`CLAUDE.md` (one pointer line). Sources: the code (the source of truth), this
plan's Decisions and Defaults,
[org-billing-model-decision.md](org-billing-model-decision.md), the log and
[org-lifecycle-review.md](org-lifecycle-review.md) (its "Checked and sound"
list maps the rules to code). Code for the "Enforced in" lines:
`Sinwy.Backend/db/organizationAccess.ts` (status, slots, cap);
`Sinwy.Backend/modules/organizations/` (create, wizard, activate,
deactivate, deletion schedule, purge); `modules/billing/` (projection,
checkout guard, plan change, suspend, cancel, resume);
`modules/transfers/`; `modules/auth/` (`auth.ts` hooks, `requirePermission.ts`,
`activeOrganization.ts`, `singleOwner.ts`); errors in
`Sinwy.Shared/types/api/ApiResponse.ts` and `types/auth/Auth.ts`. Web:
`src/shared/lib/organizations.ts`, `src/modules/auth/lib/post-login.ts`,
`src/modules/account-dashboard/lib/`. Tests to sample sit next to each
module in `tests/`.

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
