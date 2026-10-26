# Organization lifecycle code review

Phase 11 of [org-lifecycle-plan.md](org-lifecycle-plan.md). Scope: the diff
from `245b7bd` (before Phase 0) to `a30ac99` (Phase 10), plus the older code it
relies on: projection, checkout guard, account deletion, membership guards,
switcher, post-login. Nothing here is fixed; each finding suggests a direction
only.

Verification: findings marked *reproduced* were run as throwaway tests against
the test database (`bun test`, deleted afterwards). The rest point to the
exact lines that cause them.

No Critical or High findings. Every money path checked holds up: no double
charge, no subscription left billing a deleted account, no slot handed out
past the cap (see the end of this report).

## Medium

### M1. Better Auth's organization endpoints ignore inactive and scheduled organizations

`Sinwy.Backend/modules/auth/auth.ts:269-282`,
`Sinwy.Backend/modules/auth/requirePermission.ts:35-41`

**What is wrong.** The app enforces "members can't write to an inactive org"
and "a scheduled org is hidden from everyone" in `resolveMembership`, which
only guards the app's own `/api/organizations/...` routes. Better Auth's
organization plugin runs its own membership checks, and the only lifecycle
hooks are `refuseOwnerRole` and `refuseScheduledOrganization` on invitations.
Nothing guards `update`, `remove-member`, `update-member-role`, `leave`,
`get-full-organization` or `list-members`.

**Verified (reproduced),** as an admin, with the owner's org seeded:
- inactive org: `POST /api/auth/organization/invite-member` → 200, invitation
  row created;
- org scheduled for deletion: `POST /api/auth/organization/update` → 200,
  name changed; `GET /api/auth/organization/get-full-organization` → 200 with
  all 3 members; `POST /api/auth/organization/remove-member` → 200.

**Failure scenario.** During the 30-day retention after the owner deleted their
account, an admin can rename the org, read every member's email, and remove
every other member. Default 6 (restore picks a new owner from the remaining
members) then has nobody to pick. On an inactive org, members keep inviting
and managing people while the dashboard is locked, which breaks the rule the
backend states for its own routes.

**Fix direction.** One `hooks.before` guard for `/organization/*` paths that
take an `organizationId`: refuse every call for a scheduled org, and refuse
writes for an inactive one, with the same `ORGANIZATION_INACTIVE` code. Cover
it with a table-driven test over the plugin's endpoints.

### M2. An admin finishing a draft's setup takes one of the owner's slots

`Sinwy.Backend/modules/organizations/routes.ts:29-36`,
`Sinwy.Backend/modules/organizations/service.ts:246-257`

**What is wrong.** `POST /api/organizations/:id/onboarding/complete` requires
`settings:manage`, which admins hold. For a draft, the service calls
`holdSlot(target.ownerUserId, …)`, so an admin's request activates the org on
the owner's plan. The activate route, by contrast, says "owner only: the slot
is the owner's" (`routes.ts:41`) and checks ownership in the repository.

**Verified (reproduced).** Owner on Starter with a free slot, org created
while they had no plan (a draft), admin added: the admin's `complete` request
→ 200 and the org's `slot_held_at` set. The existing test
`organizations.test.ts:522` ("admin → 200") uses an active org, so it never
covered a draft.

**Failure scenario.** An org activated before finishing setup and then
deactivated reads as a draft again (Phase 7). Its admin can then fill the slot
the owner just freed for another org, against D7 (a freed slot is filled only
when the owner activates an org). The owner sees the slot gone with no action
of their own.

**Fix direction.** Take the slot in the wizard only when the caller is the
owner; an admin's completion of a draft answers 409 like at the cap, or
leaves the draft for the owner to activate.

### M3. Slot rules and table writes are spread across modules with circular imports

`Sinwy.Backend/db/organizationAccess.ts:65-146`,
`Sinwy.Backend/modules/billing/repository.ts:74-95`,
`Sinwy.Backend/modules/transfers/repository.ts:31-74, 105-136`,
`Sinwy.Backend/modules/organizations/repository.ts:71-113`,
`Sinwy.Backend/modules/auth/auth.ts:333-336`

**What is wrong.** The slot model lives in `db/organizationAccess.ts`, outside
every module, and is written from three modules. Billing's repository releases
`organization.slot_held_at` rows (`releaseSlotsOverLimit`). Transfers'
repository rewrites `member.role` (`swapOwner`) and `organization.slot_held_at`
(`moveSlot`). Organizations' repository holds and releases slots. The lock
order (plan rows by user id, then org rows) is a convention each of the four
places has to repeat. The modules also import each other in a cycle: auth →
billing → auth (`clearActiveOrganization`), auth → transfers → auth
(`resolveMembership`), auth → organizations → auth (`auth.api`). The webhook
handlers in `auth.ts:333-336` are wrapped in arrow functions only because a
bare reference is read mid-cycle.

**Verified** by reading the imports and the writes listed above.

**Failure scenario.** A fifth writer (restore, an admin tool, a new plan rule)
that skips `lockPlan` or takes locks in another order passes the cap or
deadlocks against the projection, and nothing in the type system or the
module boundary stops it. The import cycle breaks again as soon as a
module-level value is read at import time.

**Fix direction.** Make slots one module's service (organizations owns the
`organization` and `member` tables; billing asks it to "fit slots to cap N
with these picks" under its lock). Let the projection publish "plan changed"
and "plan bought for transfer X" to listeners registered at startup, rather
than importing transfers and auth.

## Low

### L1. A suspended recipient who accepts through the API is left `accepted` with no way to pay

`Sinwy.Backend/db/organizationAccess.ts:69-76`,
`Sinwy.Backend/modules/transfers/repository.ts:371-377`,
`Sinwy.Backend/modules/billing/checkoutGuard.ts:24-26`

`lockPlan` returns null for a paused plan, so `completeTransfer` treats a
suspended recipient as having no plan and marks the transfer `accepted`
(waiting on a checkout). The checkout guard then refuses that checkout,
since the paused subscription is still bound (`PLAN_EXISTS`). The dialog
avoids this (`transfer-accept.ts:23` sends a suspended user to Billing), so
only a direct API call or a stale tab hits it. The old owner then sees
"accepted and is paying for a plan" until the offer expires or the recipient
resumes and accepts again. **Fix direction:** tell "no plan" from "paused"
in `lockForHandover` and refuse acceptance while the recipient's plan is
paused.

### L2. Deactivating an org leaves it active in members' sessions

`Sinwy.Backend/modules/organizations/service.ts:182`,
`Sinwy.Backend/modules/organizations/repository.ts:100-113`,
compare `Sinwy.Backend/modules/billing/projection.ts:103-104`

When the projection takes slots away, it calls `clearActiveOrganization` for
each org. Deactivate (`releaseSlot`) doesn't, so sessions keep pointing at the
now-inactive org. Requests that fall back to the session's org still resolve
it, with reads answered and writes refused, and the shell turns members away
only once it refetches the summary. **Fix direction:** clear the sessions in
deactivate, as every other path that makes an org inactive does.

### L3. Account deletion copy describes per-organization subscriptions and leaves out the plan

`Sinwy.WebFrontend/src/modules/account-dashboard/components/settings/DangerZone.tsx:120-125`,
`Sinwy.Backend/modules/auth/emails/deleteAccountEmail.ts:8`,
`Sinwy.Backend/modules/auth/auth.ts:150-163`

The dialog says each owned org's "subscription is canceled", and the email
says each org "loses its subscription". Since Phase 6 there is one account
plan, revoked at once with no refund (D13). A user who owns no organization
is told nothing about their plan. Also, `beforeDelete` revokes the plan
before it schedules the orgs and before the user row is deleted, so a later
failure leaves the account in place without its plan. **Fix direction:**
state the plan's revocation and the lack of a refund in both places. Consider
revoking last, once scheduling has succeeded.

### L4. The one-trial rule resets when a user deletes their account and signs up again

`Sinwy.Backend/db/schema/userSchema.ts` (`user_subscription.user_id … onDelete: "cascade"`),
`Sinwy.Backend/modules/billing/checkoutGuard.ts:41`

`trial_used_at` lives on the user's subscription row, which is deleted with the
user, and the Polar customer is anonymized. The same email signing up again
gets `allowTrial: true`. Whether Polar's own trial-abuse protection catches
it wasn't checked. **Fix direction:** if D10 should survive account deletion,
keep a hash of the verified email for trials, or rely on Polar's setting and
record that.

### L5. Frontend repeats the backend's plan rules

`Sinwy.WebFrontend/src/modules/account-dashboard/lib/subscription-status.ts:108-149`
vs `Sinwy.Backend/modules/billing/service.ts:441-477`; tier order in
`billing/service.ts:221-223`, `account-dashboard/lib/plan-change.ts:12-15` and
`account-dashboard/lib/transfer-accept.ts:16-31`

`suspensionBlocker` and `cancellationBlocker` restate the backend's `SUSPEND`
and `CANCEL` refusals. Three files rely separately on `PLAN_SLUGS` being
ordered cheapest first. The server stays authoritative, so drift shows up as
a button that's enabled and then refused, or disabled for no reason. **Fix
direction:** return the available actions (or their blocker codes) in
`AccountSubscriptionDto`. Put a `planRank` or `isUpgrade` helper in
`@sinwy/shared`.

### L6. Dead refund code from the per-organization model, with tests

`Sinwy.Backend/modules/billing/refunds.ts:20-66, 92-113`,
`Sinwy.Backend/modules/billing/tests/refunds.test.ts:3-115`

`unusedAmount`, `planUnusedRefund` and `refundUnusedTime` served the Phase 4
transfer refund. Nothing outside the tests calls them now; only `refundInFull`
is used (second plan). Their tests add coverage for code that can't run.
**Fix direction:** delete them and their tests.

### L7. Stale comments and decision text

- `Sinwy.Backend/modules/transfers/expiry.ts:7`: "A payment for an expired
  transfer that lands later is refunded in full." Default 11 says the
  recipient keeps the plan and nothing is refunded, which is what the code
  does.
- `Sinwy.Backend/modules/auth/singleOwner.ts:5-7`: ownership "swaps the roles
  together with the subscription". Transfers no longer touch any
  subscription.
- The plan's first Decision says the switcher sends the owner of an inactive
  org to Account → Billing. Since Phase 7, the code
  (`Sinwy.WebFrontend/src/shared/lib/organizations.ts:33-43`) and the log
  send them to Account → Organizations.

**Fix direction:** correct the comments. Phase 12 marks the decision as
differing, or the decision is reworded.

### L8. Account plan errors reuse organization error codes

`Sinwy.Backend/modules/billing/controller.ts:29-41`

`/api/account/subscription/*` answers `ORGANIZATION_INACTIVE` for "you have no
active plan" and `ORGANIZATION_SUSPENDED` for "your plan is suspended". These
are account states, so a client can't tell them from an org-level refusal by
code. Phase 12 §13 lists codes per rule, which makes this visible. **Fix
direction:** add `PLAN_REQUIRED` (it already exists) and a `PLAN_SUSPENDED`
code for the account routes.

### L9. High-risk paths without a test

- Projection releasing slots (`billing/repository.ts:74-95`) racing an
  activation or a transfer completion. Only activation against activation
  (`slots.test.ts:106`) and accept against accept (`transfer.test.ts:357`)
  run concurrently. The lock order is reasoned, not tested.
- Better Auth's organization endpoints on inactive and scheduled orgs (M1).
- An admin completing a draft (M2).
- A suspended recipient accepting (L1).
- Account deletion while the user is the recipient of an `accepted` transfer,
  or owns a draft.

Lower-value tests sit next to these: the dead refund helpers (L6), and
`subscription-status.test.ts`'s blocker cases, which pin rules the backend
already tests (L5).

## Checked and sound

- **Cap under concurrency:** every path that hands out a slot (`holdSlot`,
  `completeTransfer`, `moveOwnership`, creation, wizard completion) locks the
  plan rows first, in user-id order, then the org rows. Paths that only free
  slots (deactivate, scheduling, projection release) can't pass the cap.
  Concurrent activations and accepts are tested.
- **Projection ordering:** `writeUserSubscription` locks the row, refuses
  older state (`modified_at`), and refuses a second subscription while one is
  bound. A second billable plan is revoked and refunded in full; a failed
  revoke throws so the webhook retries. Re-delivery and the billing page's
  re-projection converge on the same state.
- **Phase 10 coupling:** the `/checkout` hook accepts a `transferId` only for
  the caller's own `accepted`, unexpired transfer, and the body stays strict.
  `completeTransferOnPlan` checks that the transfer belongs to the
  subscription's user and is still `accepted`, so a forged or replayed
  metadata id completes nothing. It also runs on `outdated` deliveries, so a
  failed completion is retried. The dialog's two-call upgrade re-reads the
  plan and refuses to start a checkout unless the server says one is needed.
  The success page's transfer branch never activates a draft.
- **Downgrade picks:** a pick only applies when the plan lands on the stored
  downgrade. Picks naming orgs that were deleted or transferred are ignored,
  and any later update in Polar clears the stored downgrade.
- **Suspend, cancel and plan change** read Polar first and refuse each other
  while one is pending, so Polar never silently drops a `pending_update`.
- **Account deletion:** every billable subscription (past due and paused
  included) is revoked before anything else, and a revoke failure aborts the
  deletion. Owned orgs are scheduled in one transaction that frees their
  slots and cancels invitations and transfers. Polar's customer deletion
  backs this up.
- **Retention and purge:** only ownerless orgs scheduled 30 days ago or more
  are deleted; scheduled orgs can't regain an owner (transfers and
  invitations refused). The self-heal steps skip rows younger than an hour.
  Jobs take a per-name advisory lock.
- **Authorization:** activate and deactivate check ownership in SQL. Transfer
  routes need `billing:manage` (owner only). Invoice download checks the
  order's `external_id`. Plugin checkout and subscription list can't name
  another reference.
- **Status derivation:** status, plan, `draft` and `suspended` come from one
  query fragment (`organizationAccess`), and the frontend reads them from the
  summary instead of re-deriving them.
- **Code style:** request bodies are Zod schemas. Drizzle rows are mapped to
  DTOs before they leave a module. Services are plain functions. The Biome
  and type checks pass (Phase 10 verify).
