# Organization lifecycle log

Finished phases of [org-lifecycle-plan.md](org-lifecycle-plan.md), each with its spec and log entry. Append-only.

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

### Log (2026-10-23, `feat(backend, web): upgrade Polar SDK 1.x, plugin 2.x and better-auth 1.7`)
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

### Log (2026-10-23, `feat(backend, web): lock inactive organizations out of the dashboard`)
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

### Log (2026-10-25, `feat(backend, web): suspend and resume organizations with Polar pause`)
- Shipped:
  - `POST /api/organizations/:id/subscription/{suspend,unsuspend,resume}`
    (`billing:manage`). Each reads the bound subscription from Polar first
    and projects it, so a missed webhook neither decides the refusal nor
    lingers, then refuses with its own `API_ERROR_CODES` entry:
    `ORGANIZATION_INACTIVE`, `ORGANIZATION_SUSPENDED`,
    `ORGANIZATION_NOT_SUSPENDED`, `SUBSCRIPTION_TRIALING`,
    `SUBSCRIPTION_PAST_DUE`, `SUSPENSION_PENDING`, `SUSPENSION_NOT_PENDING`,
    `CANCELLATION_PENDING`, `RESUME_PAYMENT_FAILED` (402). When Polar refuses
    anyway (a concurrent change), its re-read state explains the refusal.
    The returned subscription is applied at once.
  - Projection: `paused` → `pauseSubscription` (inactive, no plan,
    `subscription_id` kept). "Suspended" is derived, not stored:
    `isSuspended` = inactive and still bound, which only that write leaves
    (no existing row broke it). `OrganizationSubscriptionDto` and
    `OrganizationSummary` carry `suspended`; `SubscriptionBillingDto` carries
    `pauseAtPeriodEnd` and `resumesAt`.
  - `listBillableSubscriptions` (entitled + paused) backs the revoke helper;
    reconcile still uses the entitled list, so a paused one never activates.
  - Checkout guard refuses a suspended org ("resume it instead"). Plan change
    refuses a suspended org and, after a Polar read, a pending pause.
  - Post-login and the post-login flags don't treat a suspended org as
    never-paid.
  - Web: billing page Suspend section (confirmation dialog: offline on the
    period end, no refund; while pending "Suspension scheduled" with Undo;
    disabled with the reason during a trial, failed payment, pending cancel
    or when billing is unavailable). `describeSubscription` shows
    "Suspends on {date}" and "Suspended"; Change plan is disabled while a
    pause is pending. The plan page loads `GET …/subscription` instead of
    `…/status` and shows a Resume panel for a suspended org; the switcher,
    Account → Organizations and the shell's redirect say "Suspended".
  - `dev:simulate-polar-webhook --type subscription.paused` now sends the
    `subscription.updated` Polar sends first, then the `subscription.paused`.
  - E2E against the sandbox, fresh `owner-with-org`: real checkout (activated
    by reconcile) → Suspend → Polar `pause_at_period_end` → Undo → Suspend →
    period end moved to now + 2 min in Polar (`current_billing_period_end`),
    which really paused it → period-end webhooks simulated with the real
    subscription id → org inactive, still bound, out of every session → the
    open dashboard tab's next navigation and a hard load both land on the
    Resume page; switcher and Account → Organizations say "Suspended";
    plugin checkout refused → Resume from Account → Organizations → Polar
    `active`, new period → onboarding (setup unfinished) → dashboard opens,
    active org set again.
- Differs from plan:
  - Account → Organizations' Resume links to the plan page rather than
    resuming in place: the charge is explained once, next to its price.
  - The plan's "failed charge leaves it past_due" can't be relied on
    synchronously: Polar **charges asynchronously**. Both sandbox resumes
    (this phase's and Phase 0's FastPaint one) answered `active` with a new
    period and no order; the paid `subscription_cycle` order came exactly
    15 minutes later (15:27:27 → 15:42:27). So resume answers 200 `active`
    and a failed
    charge arrives later as a `past_due` webhook, handled by the existing
    dunning rule. The 402 handling (past_due → 200 with a warning, still
    paused → `RESUME_PAYMENT_FAILED`) stays for the synchronous case, tested
    against stubs only.
  - Polar's pause refusals are 409s the SDK doesn't type:
    `CannotPauseSubscription` (already pending, or cancel pending),
    `NoScheduledPause` (unsuspend with none), `NotPausedSubscription`
    (resume when not paused). They are not mapped by name; the re-read
    explains them. `PauseResumeNotAllowed` exists only on the customer
    portal endpoint.
  - Setting `cancel_at_period_end: true` while a pause is pending replaces
    the pause with a cancellation (checked in the sandbox). Default 3 can't
    fully hold: Polar's portal always allows cancel at period end. Such an
    org ends up lapsed, as the default already says. The portal settings
    expose no pause toggle, so pause is off there.
- Notes for later phases:
  - Phase 3: `revokeOrganizationSubscription` already revokes paused
    subscriptions. A suspended org is inactive but bound; scheduling it for
    deletion must clear `subscription_id` (as planned), or `isSuspended`
    would still report it.
  - Phase 4: Polar's `allow_multiple_subscriptions` is **false** in the
    sandbox org (`sinwydev`). Default 7 needs it on; ask before changing it.
    Transfer offers must also refuse a pending pause (planned) and a
    suspended org (inactive, so the "org active" check covers it).
  - Suspend and resume need a real Polar subscription; a seeded or simulated
    one answers 422. The e2e references say so now.
  - The sandbox webhook endpoint is still disabled, so no real
    `subscription.paused`/`resumed` delivery was captured; the derived
    fixture stays. Capture real ones when the endpoint is re-enabled.
  - Not checked in the browser: the staff view of a suspended org (the
    disabled-entry path from Phase 1, with the new "suspended" reason), and
    the past_due/402 resume paths.

## Phase 3: Owner deletion and 30-day retention

**Goal:** deleting the owner's account stops all billing and makes their orgs
inactive and scheduled for deletion; a job hard-deletes them 30 days later.
Data stays intact for a future restore.

**Files:** `Sinwy.Backend/modules/auth/auth.ts` (`beforeDelete`,
`afterDelete`, invitation hooks), `modules/auth/deletedUserCleanup.ts`,
`modules/organizations/{service,repository,index}.ts`
(`deleteSoleOwnedOrganizations`, `bindSubscription`, `isSuspended`),
`modules/auth/requirePermission.ts` (`requireMember`),
`modules/billing/{service,projection}.ts`, `Sinwy.Backend/db/schema/`,
`Sinwy.Shared/types/organization/OrganizationSummary.ts`,
`Sinwy.WebFrontend/src/modules/account-dashboard/components/settings/DangerZone.tsx`,
`account-dashboard/routes/_shell.organizations.tsx`,
`shared/components/shell/OrganizationSwitcher.tsx`,
`shared/lib/organizations.ts`. Tests:
`modules/organizations/tests/accountDeletion.test.ts`,
`modules/auth/tests/deleteUserCallback.test.ts`.

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

**Verify:** start from `org-with-staff` with a pending invitation. As the
owner: Account → Settings → Danger zone shows the 30-day copy; delete the
account. DB: the org has `deletion_scheduled_at` set, `status = inactive`,
`plan` and `subscription_id` null, the invitation `canceled`, and no session
has it active. As staff: the switcher entry and Account → Organizations row
are disabled with the deletion date; the dashboard URL lands on `/account`.
Backdate `deletion_scheduled_at` by 31 days with `sinwy_rw` (state the app
can't reach in time), run `bun run db:purge-organizations`: the org and its
logo file are gone; a second run changes nothing. If time allows, repeat
with an org that has a real sandbox subscription and check Polar shows it
revoked.

### Log (2026-10-25, `feat(backend, web): keep organizations 30 days after owner account deletion, then purge`)
- Shipped:
  - `scheduleOwnedOrganizationsForDeletion` in `beforeDelete`: revokes every
    owned org's billable subscriptions (a failure schedules nothing and lands
    on the goodbye error page), then one transaction sets
    `deletion_scheduled_at`, `inactive`, `plan`/`subscription_id` null,
    cancels pending invitations and clears the orgs from sessions.
  - `writeSubscription` refuses every write to a scheduled org with
    `scheduled-for-deletion`; the projection revokes the subscription if it
    is billable (active, trialing, past_due, paused) and logs an error. A
    failed revoke throws, so the webhook is retried.
  - `resolveMembership` returns null for a scheduled org, so `requireMember`
    answers 404 and the checkout guard refuses ("Not a member"), even for an
    owner still present mid-deletion. Invitation create and accept hooks call
    `refuseScheduledOrganization` (403, `ORGANIZATION_INACTIVE`).
  - `purgeScheduledOrganizations` (`organizations/purge.ts`): unschedules
    scheduled orgs that still have an owner, revokes and schedules ownerless
    unscheduled ones, then deletes ownerless orgs scheduled 30+ days ago in
    batches of 100, plus their logo file. Both self-heal branches skip rows
    younger than 1 hour (`IN_FLIGHT_MS`): better-auth creates the org and its
    owner member in separate writes, and an account deletion runs between
    `beforeDelete` and the user delete.
  - Job runner `lib/jobs.ts`: `runJob` holds
    `pg_try_advisory_xact_lock(hashtext(name))` in a transaction for the run
    (released even if the process dies), `startJobs` runs each job at startup
    and on its interval. `index.ts` registers the purge hourly;
    `bun run db:purge-organizations` runs it once under the same lock.
  - `ORGANIZATION_RETENTION_DAYS = 30` in shared. `OrganizationSummary`
    swaps `scheduledForDeletion` for `deletesAt` (purge date, computed by the
    backend). The switcher badge and Account → Organizations say "Scheduled
    for deletion" and "This organization will be deleted on <date>".
  - Danger zone and the confirmation email describe the 30-day window.
- Differs from plan:
  - The Polar customer delete is not ours any more. better-auth runs plugin
    database hooks before the app's, so the plugin's delete (no options)
    always came first and ours got a 404. Polar clears `external_id` on
    delete, and an already deleted customer can't be anonymized afterwards
    (sandbox: 404 by id and by external id). So `polarCore.buildRequest` now
    adds `anonymize=true` to every `DELETE /v1/customers/external/…`, and
    `cleanupDeletedUser` only deletes the avatar.
  - `OrganizationSummary` carries `deletesAt`, not `deletionScheduledAt`, so
    the UI never recomputes the retention.
  - Checkout's explicit refusal is `resolveMembership` hiding the org, not a
    separate check.
  - No schema change: `deletion_scheduled_at` already existed and nothing
    needed an index yet.
- Checked in the running app (e2e, two `org-with-staff` runs):
  - Danger zone copy, the confirmation email, and the goodbye page after the
    link.
  - DB: org scheduled with `inactive`, `plan` and `subscription_id` null.
    Member and profile rows kept. 0 sessions have it active. An admin's
    pending invitation became `canceled`; the owner's own invitations were
    removed by the `inviter_id` cascade, as planned.
  - Staff: disabled switcher entry with the date tooltip, the destructive
    row in Account → Organizations, and the dashboard URL redirecting to
    `/account`. API: onboarding read and profile write 404, set-active 403,
    invite 403.
  - Purge: nothing before backdating; after a 31-day backdate the org, its
    rows and its logo file were gone; a second run changed nothing.
  - The owner's real sandbox customer is gone by id and by external id, with
    no "customer delete failed" log.
  - Not checked: a real sandbox subscription revoked by account deletion
    (seeded subscriptions exist only in the DB), that Polar actually
    anonymized the customer (deleted customers can't be read), and accepting
    an invitation to a scheduled org in the browser (unit-tested).

## Phase 4: Ownership transfer

**Goal:** the owner offers the org to a member; on acceptance the recipient
pays through their own Polar customer and becomes the owner.

**Files:** `Sinwy.Backend/modules/auth/singleOwner.ts` (`refuseOwnerRole`
and its comment), `modules/auth/auth.ts` (organization hooks: add
`afterRemoveMember`; `beforeDelete`),
`modules/organizations/repository.ts` (`writeSubscription`/`changeableBy` for
the `bound-elsewhere` bypass, `scheduleOrganizationsForDeletion` to cancel
pending transfers), `modules/organizations/purge.ts` (pattern for an
expiry job), `modules/billing/{service,projection,checkoutGuard}.ts`
(`revokeOrganizationSubscription`, `projectSubscription`, plan change and
suspend guards), `Sinwy.Backend/lib/jobs.ts` and `Sinwy.Backend/index.ts`
(register the expiry job), `Sinwy.Backend/scripts/` (pattern:
`backfillSubscriptionBindings.ts`), `scripts/dev/simulatePolarWebhook.ts`
(carry `transferId`), `Sinwy.Backend/db/schema/organizationSchema.ts`,
`Sinwy.Shared/types/organization/`,
`Sinwy.WebFrontend/src/modules/account-dashboard/routes/_shell.organizations.tsx`,
the org-dashboard settings and checkout success pages. Tests:
`modules/auth/tests/singleOwner.test.ts`,
`modules/billing/tests/projection.test.ts`.

4a. Support script (ship first, in its own commit):
- `Sinwy.Backend/scripts/transferOrganization.ts --org <id> --to <userId>`, dry
  run unless `--apply`. The target must be a member.
- In one transaction: demote the owner to admin first, then promote the target
  (the one-owner index requires that order).
- Revoke the old subscription and refund the unused time (same refund helper
  as 4b). The org becomes inactive; the new owner renews through the plan page.

4b. In-app transfer:
- Polar's "Allow multiple subscriptions" is off in the sandbox (standing
  notes); ask before turning it on.
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

**Verify:** needs a real sandbox subscription, so start from `org-with-staff`
and pay a real checkout as the owner. Owner offers the org to a staff member
in Settings; the offer email arrives (`dev:last-email`). As the recipient:
Account → Organizations → Accept → real sandbox checkout. The sandbox
webhook endpoint is off, so the completing `subscription.active` (carrying
`transferId`) must be simulated with the real new subscription id; extend
`dev:simulate-polar-webhook` if it can't carry `transferId`. Then: `member`
roles swapped with one owner, old owner sees no billing page, old
subscription revoked and a prorated refund in Polar, completion emails to
both. Also: decline, owner cancel, and the 4a script's dry run and
`--apply`.

### Log (2026-10-25, `feat(backend, web): transfer organization ownership to a member with a new checkout and prorated refund`)
- Shipped:
  - 4a in its own commit (`feat(backend): add support script to transfer
    organization ownership with a prorated refund`):
    `bun run db:transfer-organization --org <id> --to <userId> [--apply]`.
    `swapOwner` locks both member rows, then demotes and promotes. With
    `--apply` the script swaps roles, cancels any open in-app offer, revokes
    the bound subscription, projects the revocation (the org goes inactive)
    and refunds the unused time.
  - Refund helpers in `modules/billing/refunds.ts`: `unusedAmount` prorates
    an order's `net_amount` over the subscription's current period, capped
    by `refundable_amount`. Polar refunds the matching tax itself.
    `refundUnusedTime` uses the latest paid order; `refundInFull` refunds
    every refundable order. Refund failures are logged at ERROR, never thrown.
  - New module `modules/transfers/` (`@transfersModule`): table
    `organization_transfer` (migration 0012), offer/cancel/incoming/accept/
    decline endpoints, the `expire-organization-transfers` job (15 min),
    and three emails (offer, "You now own", "has a new owner").
  - `projectSubscription` routes any subscription whose metadata carries
    `transferId` to `projectTransferSubscription`
    (`modules/billing/transfer.ts`); the plain path is now
    `projectOwnSubscription`. Webhooks, reconcile and billing reads all
    go through the router.
    - First entitled state of an `accepted` transfer → `completeTransfer`.
      In one transaction it locks the org, then the transfer, swaps roles
      and rebinds `subscription_id`, then marks the transfer `completed`.
    - After that: revoke the old subscription, refund it prorated, set
      `settled_at`, email both users.
    - Completed and bound → plain projection (settles again if
      `settled_at` is null).
    - Anything else billable → revoke and refund in full.
  - Plan change and suspend answer `TRANSFER_PENDING` (40910) while an
    offer is open; offers refuse suspended, pause-pending, cancel-pending
    and inactive orgs.
  - Open transfers are canceled by `afterRemoveMember`, by a `hooks.after`
    on `/organization/leave`, by the owner's account deletion
    (`scheduleOrganizationsForDeletion`), and by the expiry job.
  - Web: Settings "Transfer ownership" (owner only) with member picker and
    pending state; Account → Organizations "Ownership offers" with Accept
    (→ Polar checkout) and Decline; `/checkout/success` polls until the
    caller owns the org, then opens its dashboard.
  - `dev:simulate-polar-webhook --transfer-id <id>`.
- Differs from plan:
  - Better Auth's `/organization/leave` doesn't fire `afterRemoveMember`,
    so leaving is caught by a `hooks.after` instead. The cancel only
    applies once the user is no longer a member.
  - Extra columns `new_subscription_id` and `settled_at`. The first tells a
    second paid checkout apart from the completing one. The second makes a
    failed old-subscription revoke retry on the next delivery (the webhook
    throws) without refunding twice.
  - Accept is optimistic, with no row lock across the Polar call. A
    concurrent accept may create one extra unpaid checkout; both callers get
    the stored checkout's URL. A second paid checkout is refunded as a stray.
  - A webhook for a transfer row that no longer exists (deleted with its org
    or a user) only revokes and logs an ERROR, with no refund. A full refund
    there could refund a new owner's paid history after the org is deleted.
  - Accept refuses an org that is no longer active (no plan to check out on).
  - "Allow multiple subscriptions" left off; not needed for the e2e (the
    recipient had no other subscription). Not asked yet.
- Checked in the running app (e2e, two `org-with-staff` orgs, real sandbox
  checkouts):
  - Decline and owner cancel: offer emails arrived, rows `declined`/
    `canceled`, a canceled offer's accept answered 404.
  - Main flow: staff accepted and paid a real Starter checkout. The
    completing `subscription.active` was simulated with the real new
    subscription id and `--transfer-id`. Roles swapped (one owner), org
    rebound, transfer `completed` and settled. The old subscription was
    revoked in Polar, with a real refund of 743 of 744 net on its order
    (bought about 5 minutes earlier). Both completion emails arrived, and the
    success page landed on the dashboard. The old owner, now admin, is
    redirected away from billing, and invoices/transfer answer 403.
  - 4a: dry run wrote nothing and planned 743; `--apply` swapped roles,
    revoked, refunded 743 in Polar and left the org inactive.
  - No WARN/ERROR in the backend log.
  - Not checked live: a real Polar delivery for a transfer subscription
    (endpoint off); real Resend sends; expiry, stray/second checkout and
    "recipient left" in the browser (unit-tested).
  - Found: unlike a plain checkout, a transfer has no reconcile from Polar,
    so a missed transfer webhook leaves the success page on "Making you the
    owner" until it times out. Polar retries webhooks; not fixed here.

## Phase 5: Booking payments investigation

**Goal:** decide which provider takes booking payments for an org's customers
and can refund them. Research only; no code.

**Files:** none; output goes to `docs/booking-payments-decision.md`.
**Verify:** none.

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

### Log (2026-10-25, `docs: decide on Stripe Connect direct charges for booking payments`)
- Shipped: `docs/booking-payments-decision.md`. Stripe Connect direct charges
  on Accounts v2 (`losses_collector: stripe`, `fees_collector: stripe`,
  `dashboard: full`); Mollie Connect for Platforms as the fallback; Adyen
  ruled out (sales-led, unpublished minimum, platform liable for negative
  balances). Five follow-up tickets, two of them for the refund rules.
- Differs from plan: nothing.
- Findings the bookings work must keep: a Stripe card refund the balance
  can't cover stays `pending`, then fails with `insufficient_funds`; other
  methods fail at once. Mollie queues the refund instead. A business can
  disconnect the platform from its Stripe or Mollie dashboard, which ends
  Sinwy's refund access. So automatic refunds on owner deletion run inside the
  deletion flow, not in the purge, and a failed refund emails the customer.
  Blocking deletion when the balance is short would conflict with D13, so it
  was left to the product owner.
- Checked in the running app: nothing (research only). Figures come from the
  providers' public docs and pricing pages (EUR, Ireland). Mollie's refund
  and chargeback fees and Adyen's minimum aren't published; the Adyen figure
  is from third-party reviews.

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

### Log (2026-10-25, `feat(backend): move billing to one plan per user with organization slots`)
- Shipped: table `user_subscription` (migrations 0013, 0014) and
  `organization.slot_held_at`; the org's `status`, `plan`, `subscription_id`
  and `subscription_status_at` are gone. The projection finds the user by
  `customer.external_id`, keeps the ordering guard and the paused binding,
  and revokes and fully refunds a second billable plan. Status is derived
  from slot + owner's plan + not scheduled (`db/organizationAccess.ts`) in
  `resolveMembership`, the set-active refusal, `listOrganizations` and the
  org status endpoint, which reconciles the owner's plan per user.
  `POST /api/account/organizations/:id/{activate,deactivate}` (owner only;
  `PLAN_REQUIRED`, `ORGANIZATION_LIMIT_REACHED`). Checkout takes `{ slug }`
  only, refuses `PLAN_EXISTS` and turns the trial off after the first plan.
  Account deletion revokes once by customer, then schedules every owned org;
  scheduling and Better Auth's delete free the slot without Polar. Transfer
  accept completes at once with a role swap and slot move, or refuses
  `RECIPIENT_NEEDS_PLAN`; the support script moves the slot only if the
  recipient has one free, no refund. Transfer checkout, stray and old-plan
  refunds and the backfill script deleted. `dev:simulate-polar-webhook
  --user`, seed activates through the slot endpoint, e2e skill references
  updated.
- Differs from plan:
  - The org billing endpoints moved instead of disappearing:
    `/api/account/subscription` (GET, with `organizationLimit` and
    `activeOrganizations`), `.../plan`, `.../suspend|unsuspend|resume` and
    `/api/account/invoices` (+ download) act on the user's plan, so the
    Phase 2 logic and its tests carried over. Phase 7's backend reads are
    done; Phases 8 and 9 extend these. `GET /api/organizations/checkout/:id`
    is removed, so `/checkout/success` is broken until Phase 7.
  - Offers no longer refuse a pending pause or cancel (nothing is revoked
    any more), and accept no longer refuses an inactive org; offers still
    refuse inactive, suspended and scheduled orgs, from the database only.
    Plan changes and suspend no longer refuse during a transfer.
  - A second billable plan is revoked only after reading the bound one from
    Polar: if that one ended without its webhook, it is projected first and
    the new one takes over.
  - A subscription for an unknown user is only logged: Polar's customer
    delete already cancels it (API docs).
  - An unknown product now leaves the user with no plan (orgs inactive),
    where an org used to stay active without features; it is still logged
    at ERROR.
  - Post-login: "select plan" only when the user has no billable plan; an
    org without a slot next to a plan raises nothing until the Phase 7
    funnel.
  - Web: accepting a transfer refreshes the lists instead of redirecting to
    a checkout, so the account page keeps working until Phase 10.
- Checked in the running app (sandbox, subagent run): real Starter checkout
  through `/checkout` with `{ slug }` only (a `reference_id` → 400), projected
  by the `GET /api/account/subscription` reconcile (webhook endpoint
  disabled); org A activated, B refused at the Starter cap (40912), a
  second checkout refused `PLAN_EXISTS`, A deactivated, B activated, a
  non-owner got 404; set-active and the org list followed each slot change.
  Simulated `subscription.paused` and `subscription.revoked` on the real id:
  both orgs inactive, B keeps its slot (Default 8), activating while paused
  → 40911. The sandbox subscription was revoked afterwards. Not checked:
  real webhook deliveries, the trial path, Professional and Enterprise caps
  (covered by tests), and the web billing pages (Phase 7). The race test
  fails with `lockPlan`'s lock removed, so it tests the lock.
