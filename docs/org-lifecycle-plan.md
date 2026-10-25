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
  Default 7 needs it on; ask before changing it (Phase 4).
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
  revoke the subscription. Phase 4's `completeTransfer` rebind must refuse
  scheduled orgs the same way.
- Owner account deletion runs `scheduleOrganizationsForDeletion` (one
  transaction); Phase 4 cancels pending transfers inside it. Invitations the
  owner sent are cascade-deleted, not canceled.
- Jobs: add a `Job` to `startJobs` in `Sinwy.Backend/index.ts`; the name is
  the advisory lock key. Self-heal queries skip rows younger than 1 hour,
  because better-auth writes the org and its owner member separately.
- The plan and onboarding pages read the org with `getFullOrganization` and
  never call `setActive`.
- Web helpers for the org list and closed-org rules live in
  `shared/lib/organizations.ts`. `AppShell`'s `banner` slot is free for
  notices.
- Phase 4: transfer offers must refuse a pending pause and a suspended org.
- e2e: file URLs use the `BETTER_AUTH_URL` origin (`localhost:3000` locally);
  `keyFromFileUrl` silently ignores any other origin.

Open, not caused by this plan:
- The plan-change dialog shows USD catalog prices while Polar charges EUR.
- Not checked in the browser yet: the staff view of a suspended org, and the
  past_due/402 resume paths.
- `invite-member` accepts `role: "member"`, which isn't an app role.
- A set-active refusal thrown in `hooks.before` is logged by Better Auth at
  ERROR level, though it's a user-caused 403.

---

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
reader knows the coverage. Commit the report with the plan and log updates.
