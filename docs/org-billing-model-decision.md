# Billing model decision: one plan per user, organizations by quota

Status: **decided**, applied to
[org-lifecycle-plan.md](org-lifecycle-plan.md) as Phases 6–10.

## Why this came up

Polar allows one active subscription per customer unless the Polar
organization turns on **Allow multiple subscriptions** (Organization Settings
→ Subscriptions). It is off in the sandbox (`sinwydev`); production is a
separate Polar organization and hasn't been checked.

Today Sinwy has one Polar customer per user (`external_customer_id` = user
id) and one Polar subscription per organization (metadata `referenceId` =
organization id). With the setting off:

- an owner who pays for one organization can't buy a plan for a second one;
- a member who already pays for an organization can't receive a transfer
  (Phase 4), because the transfer checkout starts a second subscription;
- neither case gets a clear error: Polar's refusal surfaces as "The billing
  provider refused this request".

Two ways out:

1. **Keep the current model** (one subscription per organization) and turn
   the setting on in the sandbox and in production.
2. **Change the model** (proposed): each user has at most one plan, and the
   plan's tier sets how many organizations they can run, e.g. tier 1 → 1,
   tier 2 → 2, enterprise → 5. Organizations are covered by the owner's plan,
   not paid for separately. The setting can stay off.

## Proposed model in short

- The subscription belongs to the user. The webhook projection writes a
  user-level record (subscription id, plan, status) instead of the
  organization's `status`, `plan` and `subscription_id`.
- An organization is active when its owner's plan grants access **and** the
  organization holds one of the owner's slots.
- Every organization a user owns gets the features of the owner's tier.
- Plan, invoices and payment method move from each organization's settings
  to Account → Billing.
- Members other than the owner never need a plan.

## Decisions

Each question lists the options and a suggestion. The suggestion is not a
decision; replace it with yours in **Answer**.

### D1. Which model?

- A. Keep one subscription per organization; turn on "Allow multiple
  subscriptions" in sandbox and production.
- B. One plan per user with an organization quota per tier (proposed).

Suggestion: decide after D2. B is simpler for transfers and needs no Polar
setting; A fits users who run several separate businesses.

**Answer:** B

### D2. Invoices for owners of several businesses

With one subscription per user there is one invoice per period, in one
billing name and with one VAT number. Someone running two businesses (two
legal entities) can't get an invoice per business.

- A. Acceptable: one invoice per user.
- B. Not acceptable: keep per-organization subscriptions (D1 A).

Suggestion: A if most users run one business, possibly with a few locations.

**Answer:** A

### D3. Pricing shape

- A. Fixed tiers with an organization cap (1 / 2 / 5).
- B. Per-organization quantity on one subscription (Polar seat-based price):
  the user pays for N organizations, and changing N is prorated.
- C. Tiers with a base allowance plus paid extra organizations.

Suggestion: A to start; it maps onto the existing Starter / Professional /
Enterprise products.

**Answer:** A

Tier caps (if A or C), e.g. Starter 1, Professional 2, Enterprise 5:

**Answer:** Starter 1, Professional 2, Enterprise 5

### D4. What counts toward the quota

- A. Organizations the user owns that are activated (hold a slot).
- B. Every organization the user owns, including unpaid drafts.

Also: does an organization scheduled for deletion still hold a slot during
its 30 days?

Suggestion: A, and scheduled organizations free their slot right away.

**Answer:** A agree with suggestion

### D5. Creating an organization at the cap

- A. Refuse creation; prompt an upgrade.
- B. Allow it as an inactive draft that activates once a slot is free.

Suggestion: B, so setup (name, profile) can happen before upgrading.

**Answer:** B

### D6. Downgrading below current usage

For example, Professional with 2 active organizations → Starter (cap 1).

- A. Block the downgrade until the user deactivates organizations.
- B. Allow it; the user picks which organizations stay active, the rest
  become inactive.
- C. Allow it; the oldest organizations stay active automatically.

When does it take effect?

- A. Immediately (prorated).
- B. At period end.

Polar's customer portal can also switch plans. Should plan switching stay
off in the portal so the app is the only place to change tier?

Suggestion: B (the user picks), at period end, and portal plan switching off.

**Answer:** B at period end, and portal plan switching off

### D7. Upgrading or freeing a slot

When a slot becomes free (upgrade, or an organization deactivated or
deleted), do inactive organizations reactivate?

- A. No; the user activates the one they want.
- B. Yes, oldest first.

Suggestion: A.

**Answer:** A

### D8. Suspend

One subscription means a Polar pause takes every organization offline at
once. Phase 2 shipped a per-organization suspend built on Polar pause.

- A. Suspend becomes account-wide (pause the plan). Separately, the user can
  deactivate a single organization for free, which only frees a slot.
- B. Drop Polar pause; only per-organization deactivate, plus cancelling the
  plan.

Suggestion: A, keeping the Phase 2 rules (pause at period end, one-click
resume, no refunds) at account level.

**Answer:** A

### D9. Cancel, lapse and past due

With one plan, a cancel or lapse takes every owned organization offline
together, and past due keeps them all working while Polar retries. Anything
to add, e.g. a warning that lists the organizations affected?

Suggestion: confirm as stated, with the warning.

**Answer:** Yes warning is fine

### D10. Trials

- A. One trial per user (the first plan).
- B. No trials.

Suggestion: A.

**Answer:** A

### D11. Transfer: recipient's plan

No new subscription is bought for the organization; the swap frees a slot
for the old owner and uses one of the recipient's.

- If the recipient has no plan: buy one at acceptance (checkout), or refuse
  the offer?
- If the recipient's plan is full: refuse the offer, or offer an upgrade at
  acceptance?

Suggestion: buy at acceptance when they have no plan; upgrade at acceptance
when full.

**Answer:** buy at acceptance when they have no plan; upgrade at acceptance
when full.

### D12. Transfer: old owner's money

The old owner's plan keeps running with one organization fewer.

- A. Nothing happens; they downgrade or cancel themselves.
- B. If it was their only organization, cancel their plan with a prorated
  refund.
- C. Always offer a downgrade or cancel after the transfer, no automatic
  change.

Suggestion: C.

**Answer:** A

### D13. Owner account deletion

Revoke the user's one subscription and schedule all their owned
organizations for the 30-day retention, as Phase 3 does today. Confirm, or
change?

Suggestion: confirm.

**Answer:** Confirm

### D14. Existing data and migration

Are there real paying customers on the per-organization model (production)?

- A. No, pre-launch: replace the model, no migration.
- B. Yes: migrate. Several subscriptions per user must become one, which
  needs a rule (keep the highest tier? refund the rest?).

**Answer:** A, prod has no real users we don't have to worry about that yet

### D15. Who sees billing inside an organization

With billing on the account, should organization admins see anything about
the plan (tier name, which features it unlocks), or nothing?

Suggestion: tier name and features read-only for everyone; billing actions
only on the owner's account page.

**Answer:** Admins only see tier name and nothing else, admins only concern is org that their admin of billing is only up to the owner account.

## What already shipped and what it would mean (for D1 = B)

Kept as is:

- Phase 0: Polar SDK 1.x, plugin 2.x, better-auth 1.7.
- Phase 1: inactive organizations are locked out (the reason an
  organization is inactive changes, the lockout doesn't).
- Phase 3: 30-day retention after owner account deletion, and the purge job.
- Refund helpers (`modules/billing/refunds.ts`), the jobs runner, the
  one-owner rules, and the transfer offer, accept, decline and expiry flow
  with its role swap (`modules/transfers/`).

Reworked:

- Projection and checkout guard (`modules/billing/projection.ts`,
  `checkoutGuard.ts`): the subscription is projected onto the user, and an
  organization's status derives from the owner's plan and slots.
- Plan and billing pages: from `/<org>/settings/billing` and
  `/organizations/<id>/plan` to Account → Billing.
- Onboarding funnel: "pay" is skipped when the owner has a free slot.
- `isOrganizationPublic`, `resolveMembership` and the switcher rules read
  the derived status.

Largely replaced:

- Phase 2's per-organization suspend (see D8).
- Phase 4's billing side: the transfer checkout for the organization's
  plan, `completeTransfer`'s subscription rebind, stray-payment refunds and
  the old-subscription refund (`modules/billing/transfer.ts`).

New:

- A user-level subscription record, slot assignment per organization, and
  a database-level guard so two activations can't exceed the cap (for
  example, lock the user row while counting).

## Applying the answers

For the agent that updates the plan once every **Answer** is filled in:

1. Read this document and [org-lifecycle-plan.md](org-lifecycle-plan.md).
   Read the log ([org-lifecycle-log.md](org-lifecycle-log.md)) only where a
   section above points to shipped work you need detail on.
2. If D1 = A: add "Allow multiple subscriptions is on in sandbox and
   production" to **Decisions**, replace Default 7 with it, and add a step
   to map Polar's "already has a subscription" refusal to a clear error.
   Remove the standing note saying it's off once it has been turned on.
   Nothing else changes.
3. If D1 = B:
   - Rewrite **Decisions** and **Defaults** in the plan to the answers. Mark
     the old ones they replace (one subscription per organization,
     suspension via per-organization Polar pause, transfer starts a new
     subscription) as superseded, with a pointer to this document.
   - Add new phases (status `todo`) for the model change, ordered by
     dependency, each with Goal, Files, Tests that matter, Done when and
     Verify, in the format the existing phases use. Use the "What already
     shipped" section above for the Files lists.
   - Keep Phases 0–4 as `done` in the status table; don't edit the log.
   - Put Phase 5 (booking payments research) where it still fits and move
     Phase 6 (code review) to after the new phases.
   - Prune standing notes that the new model makes wrong, and add any the
     new phases need.
4. Ask the product owner about any answer that is missing, contradicts
   another, or would change a decision not listed here.
