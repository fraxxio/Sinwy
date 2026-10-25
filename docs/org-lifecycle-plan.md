# Organization lifecycle plan

Gives an organization a full lifecycle around its single, fixed owner: suspend,
lapse, 30-day retention after owner deletion, transfer, and (later) restore.
Nothing is lost by accident, and nothing stays billed or publicly reachable
once an org is inactive. The one-owner rule shipped in #31.

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
  answers 403. Keep `experimental_organizationSync` off; billing stays on
  `referenceId` metadata.
- The plugin deletes the Polar customer on user delete; `polarCore` adds
  `anonymize=true` to it. Don't add a second delete (log: Phase 3).
- better-auth 1.7 requires a fresh session for `unlinkAccount`.

Polar sandbox (log: Phase 2):
- Polar charges asynchronously: resume answers `active` at once and the
  `subscription_cycle` order comes 15 minutes later; a failed charge arrives
  as a later `past_due` webhook.
- The portal always allows cancel at period end, and
  `cancel_at_period_end: true` replaces a pending pause.
- `allow_multiple_subscriptions` is **false** in the sandbox org (`sinwydev`).
  Default 7 needs it on; not asked yet, ask before changing it.
- Refund `amount` is net of tax; Polar refunds the matching tax itself. Use
  the helpers in `modules/billing/refunds.ts` (log: Phase 4).
- The sandbox webhook endpoint (`75e9e523…`) is disabled: no real deliveries,
  simulate them. Re-enabling it (ngrok) needs the user. The
  `subscription.paused` fixture is derived; capture real fixtures once it's on.

App state (log: Phases 1–3):
- Public pages, booking pages and custom-domain resolution must go through
  `isOrganizationPublic(org)`.
- One code, `ORGANIZATION_INACTIVE`, covers inactive and scheduled orgs.
- Members' backend reads of an inactive org still answer, writes answer 409.
  A scheduled org is hidden from everyone: `resolveMembership` returns null.
- "Suspended" is derived (`isSuspended` = inactive and still bound).
  `revokeOrganizationSubscription` revokes paused subscriptions too.
- Projection writes to a scheduled org return `scheduled-for-deletion` and
  revoke the subscription; `completeTransfer` refuses them too.
- Owner account deletion runs `scheduleOrganizationsForDeletion` (one
  transaction), which also cancels open transfers. Invitations the owner
  sent are cascade-deleted, not canceled.
- A subscription whose metadata carries `transferId` projects through
  `projectTransferSubscription`; `completeTransfer` is the only write that
  replaces a bound subscription. Unlike a plain checkout there is no Polar
  reconcile for it: a missed transfer webhook leaves `/checkout/success`
  waiting until Polar retries (log: Phase 4).
- Better Auth's `/organization/leave` fires no `afterRemoveMember`; a
  `hooks.after` covers it (log: Phase 4).
- Jobs: add a `Job` to `startJobs` in `Sinwy.Backend/index.ts`; the name is
  the advisory lock key. Self-heal queries skip rows younger than 1 hour,
  because better-auth writes the org and its owner member separately.
- The plan and onboarding pages read the org with `getFullOrganization` and
  never call `setActive`.
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
- Not checked in the browser yet: the staff view of a suspended org, and the
  past_due/402 resume paths.
- `invite-member` accepts `role: "member"`, which isn't an app role.
- A set-active refusal thrown in `hooks.before` is logged by Better Auth at
  ERROR level, though it's a user-caused 403.

---

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

## Phase 6: Code review

**Goal:** an independent pass over everything this plan changed, to find bugs
and weak spots before the work is considered done. **Investigate, verify and
report only. Don't fix anything in this phase.**

**Verify:** none; the report is the output. Read the log file for the
phases' details here, since this phase reviews them.

Scope: the full diff from the commit before Phase 0 to the last phase commit
(including `modules/transfers/` and `modules/billing/{transfer,refunds}.ts`),
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
reader knows the coverage. Commit the report with the plan and log updates.
