# Organization lifecycle plan

Gives an organization a full lifecycle around its single, fixed owner: suspend,
lapse, 30-day retention after owner deletion, transfer, and (later) restore.
Nothing is lost by accident, and nothing stays billed or publicly reachable
once an org is inactive.

The one-owner rule shipped in #31: an org has exactly one owner, set at
creation, who can't leave or be removed, and whose Polar customer pays for it.
This plan covers the rest.

## How agents work through this plan

1. Read `CLAUDE.md`, `CONTEXT.md` and the **Progress log** at the bottom of this
   file before starting. Notes left by earlier phases override this plan where
   they conflict.
2. Work on one phase at a time, in order. Don't start a phase whose
   dependencies aren't marked done in the status table.
3. A phase is finished when every item in its **Done when** list holds and
   `bun run verify` exits 0. Report the exit code and full output; never call
   it passing otherwise. For phases that change a user flow, also check that
   flow in the running app with the `e2e-test` skill.
4. When a phase is finished:
   - set its row in the status table to `done` and fill in the commit,
   - add a Progress log entry: what shipped, anything that differs from the
     plan and why, and notes for later phases (gotchas, follow-ups, decisions
     the next phase must respect),
   - commit the code changes and this file together, in one commit.
5. Commit messages are a single title line in the repo's style
   (`feat(backend, web): ...`, `fix(backend): ...`, `docs: ...`), with no body
   and no `Co-Authored-By` or other attribution trailer.
6. If something in the plan turns out to be wrong or impossible, don't work
   around it silently: write it in the Progress log, and stop and ask if it
   changes a decision listed under **Decisions**.

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 0 | Polar SDK and plugin upgrade | – | done | `feat(backend, web): upgrade Polar SDK 1.x, plugin 2.x and better-auth 1.7` |
| 1 | Inactive orgs are locked out | 0 | done | `feat(backend, web): lock inactive organizations out of the dashboard` |
| 2 | Suspend with Polar pause | 1 | todo | |
| 3 | Owner deletion and 30-day retention | 2 | todo | |
| 4 | Ownership transfer | 3 | todo | |
| 5 | Booking payments investigation | – | todo | |
| 6 | Code review | 0–5 | todo | |

Phase 5 is research only and may run at any point.

## Decisions

Settled with the product owner. Ask before changing any of them.

- **Nobody opens an inactive org's dashboard.** The read-only lapsed dashboard
  and its banner go away. In the switcher, the owner's link to an inactive org
  goes to the plan page; for everyone else the entry is disabled.
- **Suspension uses Polar pause, not cancel-at-period-end.** The org stays
  active until the paid period ends, then becomes inactive. The owner can undo
  the pause before the period ends, or resume afterwards in one click (Polar
  charges right away, no new checkout). No refunds.
- **Transfer starts a new subscription.** Polar can't move a subscription to
  another customer. The recipient checks out at acceptance, which also proves a
  valid payment method. The old subscription is revoked and the old owner gets
  the unused time refunded, prorated by time.
- **Only an existing member can receive a transfer.** The old owner stays on as
  admin and loses `billing:manage`.

### Defaults (not yet confirmed; change only if asked)

1. An owner deleting the org on purpose (Better Auth `deleteOrganization`)
   stays an immediate hard delete. Only owner *account* deletion gets the
   30-day window.
2. The Polar customer is deleted with `anonymize: true`.
3. Pause and cancel stay off in the Polar customer portal; the app is the only
   place to suspend. An org still canceled through the portal ends up lapsed
   and goes through the renew checkout.
4. A trialing org can't be paused (Polar only pauses `active`), so Suspend is
   disabled during a trial.
5. Never-paid and lapsed orgs never expire; only orgs scheduled for deletion
   are purged.
6. Restore (later) will need a new owner chosen from the remaining members.
   Nothing about the deleted user is kept.
7. Polar's "Allow multiple subscriptions" must be on, since a transfer
   recipient may already pay for another org. Check it in Phase 4.

## Current state (before Phase 0)

| Concern | Where | Notes |
| --- | --- | --- |
| Status projection | `Sinwy.Backend/modules/billing/projection.ts` | `active`/`inactive` from the Polar subscription. Non-entitled clears `subscription_id`. |
| Projection writes | `Sinwy.Backend/modules/organizations/repository.ts` | `bindSubscription` / `releaseSubscription`, ordered by `subscription_status_at`, refuse `bound-elsewhere`. |
| Revoke helper | `Sinwy.Backend/modules/billing/service.ts` `revokeOrganizationSubscription` | Revokes entitled subscriptions only (`active`, `trialing`, `past_due`). |
| Owner account deletion | `Sinwy.Backend/modules/auth/auth.ts` `beforeDelete` → `deleteSoleOwnedOrganizations` | Revokes, then hard-deletes the orgs. `afterDelete` deletes the Polar customer. |
| Checkout guard | `Sinwy.Backend/modules/billing/checkoutGuard.ts` | `billing:manage` (owner only) and "not already active". |
| One owner | `Sinwy.Backend/modules/auth/singleOwner.ts`, `member_one_owner_uidx` | Ownership never moves today. |
| Lapsed dashboard | `Sinwy.WebFrontend/src/modules/org-dashboard/components/InactiveOrganizationBanner.tsx`, `shared/lib/auth/read-only.ts`, `organization-inactive.ts` | Read-only mode for inactive orgs. |
| Switcher | `Sinwy.WebFrontend/src/shared/components/shell/OrganizationSwitcher.tsx` | "Inactive" badge exists, link always enabled. Uses Better Auth's org list (no role). |
| Post-login | `Sinwy.WebFrontend/src/modules/auth/lib/post-login.ts` | Session's active org, else newest; unpaid → plan page; lapsed → dashboard. |
| Account → Organizations | `Sinwy.WebFrontend/src/modules/account-dashboard/routes/_shell.organizations.tsx` | Empty-state stub. |
| Public pages, bookings, custom domains | – | Not built yet. Dashboard routes for them are placeholders. |
| Scheduled jobs | – | None exist. |
| Polar packages | `Sinwy.Backend/package.json` | `@polar-sh/sdk` 0.47.1 and `@polar-sh/better-auth` 1.8.4, neither supports pause. |

---

## Phase 0: Polar SDK and plugin upgrade

**Goal:** the SDK can pause and resume subscriptions; nothing else changes.

Steps:
- Upgrade `@polar-sh/sdk` to 1.x and `@polar-sh/better-auth` to 2.x (both
  major bumps). Read their changelogs and fix every breaking change in
  `infrastructure/polar/`, `modules/billing/`, `modules/auth/auth.ts` and the
  dev scripts (`capturePolarFixture`, `simulatePolarWebhook`).
- Confirm the new SDK exposes `pauseAtPeriodEnd`, `resumesAt`, `resume` on
  subscription update, and `paused` in the subscription status enum.
- Add `paused` to `SUBSCRIPTION_BILLING_STATUSES` in `@sinwy/shared`. Until
  Phase 2 lands, `describeSubscription` shows it as inactive.
- Capture a `subscription.paused` fixture with `dev:capture-polar-fixture`, and
  re-capture the existing ones if the payload shape changed.

Polar sends `subscription.updated` alongside `subscription.paused` and
`subscription.resumed`, so the existing `onSubscriptionUpdated` handler picks
both up. Don't register separate handlers unless the plugin stops doing that.

Done when:
- Existing billing tests pass unchanged in intent (fixtures may be refreshed).
- Checkout, plan change, portal and webhook projection still work end to end in
  the running app with the Polar sandbox.

## Phase 1: Inactive orgs are locked out

**Goal:** an inactive org can't be opened by anyone, and is never the session's
active org or the post-login destination. Prepares the columns the later
phases need.

Backend:
- Migration: add `organization.deletion_scheduled_at timestamp` (null). Expose
  it to Better Auth as an additional field with `input: false`. Nothing sets it
  until Phase 3.
- `GET /api/organizations` (requireAuth): the caller's orgs as
  `OrganizationSummary` DTOs with `id`, `name`, `slug`, `status`, `plan`,
  `isOwner` and `scheduledForDeletion`. The switcher needs the role, which
  Better Auth's org list doesn't return. One query: `member` join
  `organization` on `member_userId_idx`.
- `hooks.before` on `/organization/set-active` (the organization plugin has no
  `beforeSetActive` hook): refuse an org that is inactive or scheduled for
  deletion with `FORBIDDEN` and a code the frontend can tell apart. Look the
  org up by id or slug, whichever the body carries. `null` (leave the org)
  stays allowed.
- When an org leaves `active` (in the projection's `applied` path for an
  inactive write), clear `session.active_organization_id` for it. Export a
  function from the auth module for this; organizations and billing must not
  touch the session table directly.
- `isOrganizationPublic(org)`: true when `status === "active"` and
  `deletion_scheduled_at` is null. Export it from the organizations module.
  Public pages, booking pages and custom-domain resolution must go through it
  when they're built; record that rule in `docs/user-creation-roadmap.md`.
- Keep the 409 `ORGANIZATION_INACTIVE` refusal on writes: the org can lapse
  mid-session.

Frontend:
- Switcher reads the new endpoint (TanStack Query, invalidated after plan
  changes, checkout success and deactivation). Inactive orgs keep the
  "Inactive" badge:
  - owner → link to `/organizations/$id/plan` (`intent: "renew"` for a lapsed
    org; the funnel step for a never-paid one),
  - everyone else → disabled item with a tooltip ("This organization has no
    active plan"),
  - scheduled for deletion → disabled for everyone.
- `/$organizationSlug/_shell` `beforeLoad`: if the org is not active, redirect
  (owner → plan page, others → `/account` with a toast). The `set-active`
  refusal is the backstop.
- Delete `InactiveOrganizationBanner` and the read-only mode that only existed
  for the lapsed dashboard (`read-only.ts`, its use in `usePermissions`, and its
  tests). `handleOrganizationInactive` keeps the toast and its
  `router.invalidate()`, which now redirects out through the shell.
- `postLoginDestination`: use the session's active org only if it is active,
  otherwise the newest active org. With none, an owner with a never-paid org
  goes to its plan page (the funnel must stay reachable); everyone else goes to
  `/account`.
- Account → Organizations: replace the stub with a list of all the user's orgs,
  showing status and owner actions ("Choose a plan" now; "Resume" in Phase 2;
  incoming transfer offers in Phase 4). Keep the empty state for users with no
  orgs.

Docs:
- Update `docs/user-flow-map.md` §8 (no read-only dashboard; owner → plan page).
- Add **Suspended**, **Scheduled for deletion** and **Ownership transfer** to
  `CONTEXT.md`, and update **Organization Status**.

Tests that matter:
- `set-active` refuses inactive and scheduled orgs and still allows active ones
  and `null`.
- `postLoginDestination` table: active session org, inactive session org with
  another active org, only inactive orgs as owner (never-paid vs lapsed), only
  inactive orgs as staff.
- Org list endpoint returns only the caller's orgs, with the right `isOwner`.
- Deactivation clears the active org from sessions and leaves other sessions
  alone.

Done when:
- No route renders the org shell for an inactive org, for any role.
- An owner can still reach the plan page and renew from the switcher and from
  Account → Organizations.
- Lapsed and never-paid flows checked in the running app (`e2e-test`).

## Phase 2: Suspend with Polar pause

**Goal:** the owner can suspend an org at the end of its paid period, undo that
before the period ends, and resume afterwards without a new checkout.

Backend (billing module, all routes `billing:manage`):
- `POST /api/organizations/:organizationId/subscription/suspend` →
  `subscriptions.update({ pauseAtPeriodEnd: true })`. Refuse when inactive,
  trialing, past due, or already pending pause/cancel, each with its own error
  code. Apply the returned subscription right away, as `changeOrganizationPlan`
  does.
- `POST .../subscription/unsuspend` → `pauseAtPeriodEnd: false`, only while the
  pause is still pending.
- `POST .../subscription/resume` → `resume: true`, only while paused. Polar
  charges immediately; apply the returned subscription. A failed charge leaves
  the subscription `past_due`, which grants access under the existing dunning
  rule; say so in the response so the UI can tell the owner to fix payment.
- Projection: `paused` writes `status = inactive`, `plan = null` and **keeps
  `subscription_id` bound**. Resume needs that link, and keeping it blocks a
  second checkout. Only `canceled`/revoked releases the binding. Add a
  repository write for this case; don't overload `releaseSubscription`.
- `reconcileInactiveOrganization` must not activate from a paused
  subscription.
- Split the subscription listing: `listEntitledSubscriptions` (grants access)
  and `listBillableSubscriptions` (could still charge: entitled plus `paused`).
  The revoke helper uses the billable list; a paused subscription with
  `resumes_at` would otherwise charge a deleted org later.
- Checkout guard refuses while a paused subscription is bound ("resume
  instead"). Plan change refuses while a pause is pending or in effect.
- `SubscriptionBillingDto` gains `pauseAtPeriodEnd` and `resumesAt`.

Frontend:
- Billing page: a Suspend section with a confirmation dialog stating no refunds
  and that the org goes offline on `{period end}`. While pending: "Suspends on
  {date}" with an Undo button.
- `describeSubscription`: "Suspends on {date}" and "Suspended" states.
- Plan page: a suspended org shows Resume instead of plan cards; the
  checkout-success style polling waits for `active`.
- Account → Organizations: Resume action for suspended orgs.

Tests that matter:
- Projection: paused keeps the binding and goes inactive; a later `active` on
  the same subscription reactivates; an older `active` arriving after `paused`
  is ignored; `canceled` after `paused` releases.
- Revoke helper revokes paused subscriptions.
- Checkout refused for a paused org; plan change refused while pause pending.
- Suspend/unsuspend/resume refusals for each invalid state.

Done when:
- Suspend → period end (simulate the webhook) → locked out → resume → active,
  checked in the running app.

## Phase 3: Owner deletion and 30-day retention

**Goal:** deleting the owner's account stops all billing and makes their orgs
inactive and scheduled for deletion; a job hard-deletes them 30 days later.
Data stays intact for a future restore.

Backend:
- Replace `deleteSoleOwnedOrganizations` with
  `scheduleOwnedOrganizationsForDeletion(userId)` in `beforeDelete`:
  1. revoke every owned org's billable subscriptions (throws on failure,
     blocking the account deletion, as today);
  2. in one transaction per user: set `deletion_scheduled_at = now()`, set
     `status = inactive`, `plan = null`, `subscription_id = null`, set pending
     invitations to `canceled`, and clear the orgs from sessions.
  Invitations the owner sent are removed anyway by the `inviter_id` cascade.
- Keep the `afterDelete` Polar customer deletion; pass `anonymize: true`.
- `bindSubscription` refuses scheduled orgs with a new result
  `scheduled-for-deletion`; the projection then revokes that subscription and
  logs an error. This covers a checkout racing the account deletion.
- Invitation create and accept hooks refuse scheduled orgs. Checkout is already
  refused (no owner left means nobody has `billing:manage`), but refuse
  explicitly too.
- `requireMember` treats a scheduled org as not found for every member.
- Purge job `purgeScheduledOrganizations()` in the organizations module:
  - deletes orgs with `deletion_scheduled_at <= now() - interval '30 days'`, in
    batches, plus their logo files through the storage client;
  - schedules any org with no owner and no `deletion_scheduled_at` (account
    deletion succeeded after `beforeDelete` failed to mark it), with a warn log;
  - unschedules any scheduled org that still has an owner (`beforeDelete`
    marked it, then the user delete failed), with a warn log.
- Runner: there is no job infrastructure, so add a minimal one in
  `Sinwy.Backend/lib/` that runs registered jobs at startup and on an interval,
  each under `pg_try_advisory_lock` so two server instances never run the same
  job together. Register the purge hourly. Add `db:purge-organizations` to run
  it by hand. Keep the runner small enough to swap for a real scheduler later.
- `RETENTION_DAYS = 30` lives in one place (shared, since the UI shows it).

Frontend:
- Account deletion preview and `DangerZone` copy: owned orgs are scheduled for
  deletion in 30 days, members lose access immediately, public pages go
  offline, subscriptions are canceled.
- Members of a scheduled org see it disabled in the switcher and in Account →
  Organizations, with the deletion date.

Tests that matter:
- Account deletion schedules every owned org, cancels pending invitations and
  revokes billable subscriptions; a revoke failure deletes nothing and
  schedules nothing.
- Orgs where the deleted user was only a member are untouched.
- A subscription activating for a scheduled org is refused and revoked.
- Purge deletes exactly the expired orgs, never lapsed or never-paid ones, and
  is safe to run twice. Both self-healing branches.

Done when:
- Owner account deletion → org scheduled, invisible to members' dashboards,
  purge with a backdated date removes it. Checked in the running app.

## Phase 4: Ownership transfer

**Goal:** the owner offers the org to a member; on acceptance the recipient
pays through their own Polar customer and becomes the owner.

4a. Support script (ship first, in its own commit):
- `Sinwy.Backend/scripts/transferOrganization.ts --org <id> --to <userId>`, dry
  run unless `--apply`. The target must be a member.
- In one transaction: demote the owner to admin first, then promote the target
  (the one-owner index requires that order).
- Revoke the old subscription and refund the unused time (same refund helper
  as 4b). The org becomes inactive; the new owner renews through the plan page.

4b. In-app transfer:
- Check Polar's "Allow multiple subscriptions" setting is on; record the result
  in the Progress log.
- Table `organization_transfer`: `id`, `organization_id`, `from_user_id`,
  `to_user_id`, `status` (`pending`, `accepted`, `completed`, `declined`,
  `canceled`, `expired`), `expires_at` (7 days), `checkout_id`,
  `old_subscription_id`, timestamps. Partial unique index: one `pending` or
  `accepted` per org.
- Endpoints:
  - owner: offer to a member (org active, no pending pause or cancel, not to
    themselves), cancel the offer;
  - recipient: list incoming offers, decline, accept.
- Accept creates the checkout with `polarClient.checkouts.create` for the
  org's current plan, with the recipient as external customer and metadata
  `{ referenceId, transferId }`. It does not go through the plugin's
  `/checkout`, whose guard refuses active orgs.
- Webhook: an `active` subscription carrying `transferId` goes through
  `completeTransfer` instead of the plain projection. In one transaction:
  check the transfer is still `accepted`, the recipient is still a member and
  the owner unchanged; swap roles (demote, then promote); rebind
  `subscription_id` to the new subscription (the only allowed bypass of
  `bound-elsewhere`); mark the transfer `completed`.
- After the transaction: revoke the old subscription and refund the unused
  share of its last order, prorated by time, via `POST /v1/refunds`
  (`order_id`, `amount`, `reason`). A refund failure is logged at error level
  for a manual refund; the transfer is not rolled back.
- If the transfer is no longer `accepted` when the webhook arrives, revoke the
  new subscription and refund it in full.
- Cancel pending transfers when the recipient leaves or is removed
  (`afterRemoveMember`), when the owner's account is deleted (Phase 3 flow),
  and on expiry (purge job runner).
- Block plan change, suspend and new offers while a transfer is pending.
- Emails: offer to the recipient; completion to both users.
- Update the `refuseOwnerRole` comment: ownership moves only through a
  transfer.

Frontend:
- Settings: "Transfer ownership" (owner only) with a member picker, and the
  pending state with Cancel.
- Account → Organizations: incoming offers with Accept (→ checkout) and
  Decline. The checkout success page waits until the recipient is owner.

Tests that matter:
- Role swap keeps exactly one owner at every step.
- Webhook for a canceled or expired transfer revokes and fully refunds.
- Old subscription revoked and refund amount correct at period start, middle
  and last day.
- Concurrent offers and double accept.

Done when:
- Offer → accept → checkout → new owner, old owner admin without billing
  access, old subscription revoked and refunded. Checked in the running app.

## Phase 5: Booking payments investigation

**Goal:** decide which provider takes booking payments for an org's customers
and can refund them. Research only; no code.

Early finding: Polar can't. It is merchant of record for our own products and
pays out only to us, with no connected accounts for each business.

- Compare Stripe Connect (direct charges, Refunds API, application fees),
  Mollie Connect and Adyen for Platforms on: countries, onboarding for small
  businesses, refunds API, who carries refund and chargeback liability, fees,
  and what happens when the business's balance can't cover a refund.
- Cover the two lifecycle rules: an inactive org's owner chooses to refund
  upcoming paid bookings or handle them off-platform; an owner's account
  deletion refunds upcoming paid bookings automatically. With direct charges,
  refunds come out of the business's own balance, so automatic refunds after
  the owner is gone can fail.
- Write the result to `docs/booking-payments-decision.md` and list follow-up
  tickets for the two refund behaviours. They're built once bookings exist.

## Phase 6: Code review

**Goal:** an independent pass over everything this plan changed, to find bugs
and weak spots before the work is considered done. **Investigate, verify and
report only. Don't fix anything in this phase.**

Scope: the full diff from the commit before Phase 0 to the last phase commit,
plus older code these changes rely on or touch (projection, checkout guard,
account deletion, membership guards, switcher, post-login).

Check for:
- **Bugs**, new or left over: races (webhooks against user actions, two server
  instances, double submits), wrong state transitions, money paths that can
  double-charge, skip a refund or leave a subscription billing a dead org,
  missing authorization, and data that can be lost before the 30 days are up.
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
  coupling between modules, and schema choices that will be costly to change.

Every finding must be verified: reproduce it, point to the exact lines, or
show the failing input. Drop anything that doesn't hold up.

Output: `docs/org-lifecycle-review.md`, findings grouped by severity
(**Critical**, **High**, **Medium**, **Low**). Each finding has:
- a title and `file:line`,
- what is wrong and how it was verified,
- the concrete failure scenario and why it matters,
- a suggested direction for the fix (not the fix itself).

End the report with a short list of what was checked and found sound, so the
reader knows the coverage. Commit the report and this file's Progress log
entry together.

---

## Progress log

Newest entry last. One entry per finished phase, plus entries for blockers or
plan changes discovered mid-phase.

Template:

```md
### Phase N: <title> (YYYY-MM-DD, <commit sha>)
- Shipped: …
- Differs from plan: … (and why)
- Notes for later phases: …
```

### Phase 0: Polar SDK and plugin upgrade (2026-10-23, `feat(backend, web): upgrade Polar SDK 1.x, plugin 2.x and better-auth 1.7`)
- Shipped:
  - `@polar-sh/sdk` 0.47.1 → 1.0.2 and `@polar-sh/better-auth` 1.8.4 → 2.1.0
    (backend and web). The SDK is pinned to API version `2026-10` through its
    import path. `infrastructure/polar` exports `polarClient` (ours),
    `polarCore` (the plugin's), `PolarModels` and `PolarApiErrors`; take Polar
    types and errors only from there.
  - Confirmed in the SDK types and against the sandbox: `subscriptions.update`
    takes `{ pause_at_period_end, resumes_at }` and `{ resume: true }`, and
    `paused` is a subscription status.
  - `paused` added to `SUBSCRIPTION_BILLING_STATUSES`; `describeSubscription`
    shows it as Inactive.
  - `subscription.paused` fixture, derived rather than captured: the sandbox
    webhook endpoint has been disabled since 2026-10-19, so Polar recorded no
    delivery for it. `fastpaint`'s sandbox subscription really paused at
    period end; the fixture is the recorded `subscription.updated` envelope
    with that subscription (`GET /v1/subscriptions/{id}`) as `data`, and same
    keys as a real delivery. It was resumed with `{ resume: true }` afterwards
    (active, new period from now). The simulator sends it; the app ignores it
    on purpose (a test pins that), since `subscription.updated` carries the
    state.
  - E2E against the sandbox: sign-up creates the Polar customer, real checkout
    and payment, activation through reconcile (no webhook reachable), billing
    details, invoice download, plan change, portal. Webhook projection checked
    with `dev:simulate-polar-webhook`. Real webhook delivery (ngrok) not run.
- Differs from plan:
  - Plugin 2.x needs `better-auth` ^1.7, so better-auth went 1.6.23 → 1.7.12,
    and zod 4.4.3 → 4.6.7 (better-auth 1.7 needs ^4.5.4; two zod copies broke
    types). The generated auth schema is unchanged (checked with
    `auth generate` on both versions).
  - Bun re-resolves every `latest` dependency whenever a workspace manifest
    changes, so the TanStack packages moved within their majors (react-start
    1.168 → 1.169, react-query 5.101 → 5.104, devtools 0.14 → 0.15).
  - SDK 1.x field names are snake_case: `pause_at_period_end`, `resumes_at`.
  - Existing fixtures weren't re-captured: the sandbox webhook endpoint still
    sends API `2026-04`, and `Subscription`, `Order` and `Checkout` are
    identical in `2026-04` and `2026-10`. Fixtures no longer record
    `sdkVersion` (the SDK doesn't parse payloads any more, and doesn't export
    its `package.json`).
- Notes for later phases:
  - SDK 1.x returns raw JSON: snake_case fields, ISO date strings (wrap in
    `new Date()`), no runtime validation. Webhook payloads too:
    `validateEvent` checks only the signature and the event type.
  - Ids are positional: `subscriptions.update(id, body)`, `get(id)`,
    `revoke(id)`, `customers.deleteExternal(externalId, { anonymize: true })`.
    Paging: `subscriptions.iterList`; tests stub it with `polarPages(...)`.
  - Errors: `PolarClientError` (4xx, parsed body on `.error`),
    `PolarServerError`, `PolarNetworkError` (timeouts too).
    `subscriptions.update` 403 and 409 are unions; tell them apart by
    `error.error.error` (`AlreadyCanceledSubscription`, `InactiveSubscription`,
    `PaymentNotReady`; `SubscriptionLocked`, `SubscriptionNotScheduledToCancel`).
    A failed resume charge is `SubscriptionsUpdate402Error` (`PaymentFailed`,
    `PaymentActionRequired`). Check which status Polar uses for
    `PauseResumeNotAllowed` before mapping Phase 2's refusals.
  - The plugin calls Polar through `polarCore`. Tests that sign up, update or
    delete users, or hit plugin endpoints, must use `stubPolarCore()` from
    `test/helpers`, or they reach the sandbox.
  - Plugin 2.x checkout bodies and the subscription list query are snake_case
    (`reference_id`); the auth before-hook guards them. A bad webhook signature
    now answers 403, not 400.
  - Plugin 2.x still deletes the Polar customer on user delete, as 1.8.4 did,
    without `anonymize`, and `cleanupDeletedUser` deletes it too, so one of the
    two gets a 404. Phase 3 must pick one when adding `anonymize: true`.
  - Keep the plugin's `experimental_organizationSync` off; billing stays on
    `referenceId` metadata.
  - The web auth client drops the plugin's `getActions` from its type (plugin
    2.1's client types don't fit better-auth 1.7), so `checkoutEmbed` is
    untyped there.
  - better-auth 1.7: `unlinkAccount({ accountId: account.id })`, and it now
    requires a fresh session.
  - The sandbox webhook endpoint (`75e9e523…`) is **disabled** since
    2026-10-19: no real deliveries reach the app, and Polar records none.
    Re-enable it, pointed at the ngrok URL, before Phase 2's real pause/resume
    check, and capture real `subscription.paused`/`resumed` fixtures then. It
    can move to API `2026-10` at the same time.
  - Dev only: TanStack devtools logs `Cannot read properties of null (reading
    'append')` during SSR. Pre-upgrade devtools-ui 0.7.0 has the same code.
  - The plan-change dialog shows USD catalog prices ($12, $48, $96) while
    Polar charges €9 and €18. Not caused by this phase.

### Phase 1: Inactive orgs are locked out (2026-10-23, `feat(backend, web): lock inactive organizations out of the dashboard`)
- Shipped:
  - `organization.deletion_scheduled_at` (migration `0011`), a Better Auth
    additional field `deletionScheduledAt` (`input: false`), mirrored in the
    web auth client schema. Nothing sets it yet.
  - `GET /api/organizations` → `OrganizationSummary[]` (oldest first), one
    `member` ⋈ `organization` query on `member_userId_idx`.
  - `hooks.before` on `/organization/set-active`
    (`modules/auth/activeOrganization.ts`): resolves the org the way the
    plugin does (null leaves, id beats slug, neither means the session's
    current org) and refuses one that fails `isOrganizationPublic` with
    `403` and `code: "ORGANIZATION_INACTIVE"` (`AUTH_ERROR_CODES` in shared).
    Only members get that refusal; non-members still get the plugin's own,
    so the status never leaks.
  - `clearActiveOrganization(organizationId)` exported from the auth module;
    the projection calls it after an applied inactive write.
  - `isOrganizationPublic(org)` exported from the organizations module; the
    rule is recorded in `docs/user-creation-roadmap.md` (Step 5).
  - Web: `shared/lib/organizations.ts` holds the list query
    (`organizationsQuery`, `invalidateOrganizations`), `isOrganizationOpen`,
    `reactivationLink` (owner, not scheduled → plan page, `intent: "renew"`
    when lapsed) and `closedOrganizationReason`. The switcher, the org shell
    guard, post-login and Account → Organizations all use them. The list is
    invalidated after org creation, checkout success, plan change and a 409
    `ORGANIZATION_INACTIVE`.
  - Org shell `beforeLoad`: checks the (cached) list first, then `setActive`;
    a `ORGANIZATION_INACTIVE` refusal refetches the list and redirects the
    same way (owner → plan page, others → `/account` with a toast).
  - Removed: `InactiveOrganizationBanner`, `read-only.ts` and its test,
    `canAct`/`isActive` in `usePermissions`, `InactivePlanSection` and the
    inactive branches of the billing page and `UpgradePrompt`.
  - E2E (seeded `org-with-staff` and `owner-with-org`, webhooks simulated):
    revoke while the owner's dashboard tab is open → session's active org
    cleared in the DB; the next in-app navigation is refused by `set-active`
    and lands on the renew plan page; hard load of the dashboard URL → plan
    page; post-login → `/account`; Account → Organizations shows "Renew
    plan"; switcher entry links to the plan page. Staff: post-login →
    `/account`; dashboard URL → `/account` with "This organization has no
    active plan"; switcher entry disabled with that tooltip; list row says
    to ask the owner. Renewal webhook → owner's post-login opens the
    dashboard and sets the active org again. Never-paid owner: post-login,
    dashboard URL and onboarding URL all → funnel plan page; "Get started"
    still opens a Polar sandbox checkout (abandoned).
- Differs from plan:
  - The plan page and the onboarding page called `setActive` themselves,
    which the new refusal broke for inactive orgs. Both now read the org
    with `getFullOrganization` and never change the session's active org.
  - `OrganizationSummary` also carries `onboardingCompletedAt` (ISO string):
    the switcher needs it to tell lapsed (renew copy) from never-paid
    (funnel). `hasCompletedSetup`/`isLapsed` moved to
    `shared/lib/organizations.ts` so `shared/` can use them.
  - One code, `ORGANIZATION_INACTIVE`, covers both inactive and scheduled
    orgs; a scheduled org is inactive anyway from Phase 3 on.
  - Post-login reads the new endpoint and uses `isOwner`, instead of
    fetching each org's roles for `billing:manage`; it is now synchronous.
  - `raiseAccessDenied` takes an optional title, so the shell's redirect to
    `/account` reuses the parked-toast mechanism.
- Notes for later phases:
  - Only the dashboard is locked. Backend reads for members of an inactive
    org (`GET …/onboarding`, `…/subscription`, `…/status`) still answer;
    writes still answer 409. Phase 3 makes `requireMember` treat scheduled
    orgs as not found.
  - `clearActiveOrganization` runs after the projection's transaction, not
    inside it. If it fails, the webhook errors and Polar's retry is
    `outdated`, so the stale session row stays; the shell guard and the
    `set-active` refusal still keep the user out. Phase 3 can clear sessions
    inside its own transaction as planned.
  - `session.active_organization_id` has no index (the auth schema is
    generated by Better Auth's CLI), so the clear is a sequential scan. Fine
    while deactivations are rare; add an index if the session table grows.
  - `scheduledForDeletion` is a boolean. Phase 3 wants the deletion date in
    the switcher and Account → Organizations: add `deletionScheduledAt` to
    the DTO then. The list and switcher already disable scheduled orgs and
    show "This organization is scheduled for deletion".
  - Phase 2: a suspended org goes through `reactivationLink` like a lapsed
    one; the plan page must show Resume for it, and Account → Organizations
    needs the Resume action next to "Renew plan"/"Choose a plan"
    (`OrganizationRow` in `account-dashboard/routes/_shell.organizations.tsx`).
  - `AppShell`'s `banner` slot has no user now; kept for Phase 2/3 notices.
  - The header's "Organization dashboard" goes through post-login, so a user
    whose orgs are all closed lands on `/account`.
  - E2E tooling: `playwright-cli` kept only one named browser session alive
    at a time here, and `playwright-cli list` hung; reopen a session with
    `open` + `state-load` when it reports "not open".
