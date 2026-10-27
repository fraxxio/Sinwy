# Polar webhook events log

Finished phases of [polar-webhook-events-plan.md](polar-webhook-events-plan.md).


---

## Phase 1: Paused and resumed handlers

**Goal:** `subscription.paused` and `subscription.resumed` project the subscription on their own, with the same `modified_at` ordering as the other events.

**Files:**
- `Sinwy.Backend/modules/auth/auth.ts`: the `webhooks({...})` call (around line 335) and its comment.
- `Sinwy.Backend/modules/billing/projection.ts`: `applySubscriptionEvent`, `projectSubscription` (read only, no change expected).
- `Sinwy.Backend/scripts/dev/tests/simulatePolarWebhook.test.ts`: the test "subscription.paused alone → 200, ignored…" (line 121).
- `Sinwy.Backend/modules/billing/tests/projection.test.ts`: the existing paused tests (lines 129–200).
- `Sinwy.Shared/package.json`: `better-auth` `^1.6.11` → `^1.7.0`, matching the root.
- Docs: `.agents/skills/e2e-test/references/simulate-polar-webhook.md` ("has no handler" bullet, "The app's handling" list) and `docs/org-rules-map.md` ("its webhooks (subscription active, updated, revoked)").

**Steps:**
- Add `onSubscriptionPaused` and `onSubscriptionResumed`, wrapped like the existing handlers, which are wrapped because of the import cycle.
- No new logic in the projection: the payload's `status` decides, and `modified_at` orders the events.
- Run `bun install` after the Shared bump, and check that the lockfile doesn't change resolved versions.

**Tests that matter:**
- `subscription.paused` alone, without the preceding update, makes the plan paused and still bound, and the owner's orgs inactive.
- `subscription.resumed` alone, carrying an active subscription, gives the plan back and makes the orgs active again.
- A redelivered `subscription.paused` with an older `modified_at` after the resume doesn't flip the plan back.
- Polar's real sequence (an update, then paused or resumed, with the same data) projects once; the second event is `outdated`.

**Done when:**
- Both handlers are wired, the simulator test reflects that paused now projects, the docs list five handled events, and `bun run verify` passes.

**Verify:** Seed an owner with an active plan and one org holding a slot. Simulate `subscription.active`, then `subscription.paused` on the same `--subscription-id` with a later `--timestamp`. `user_subscription` should show `status=paused`, `plan` null and `subscription_id` still set, and the org should be `inactive`. Then send `subscription.active` with a later timestamp: plan restored, org `active`. Replaying the paused delivery with its original `--timestamp` and `--webhook-id` changes nothing. Everything is simulated; there is no Polar call.

### Log (2026-10-27, `feat(backend): project Polar subscription paused and resumed webhooks on their own`)
- Shipped: `onSubscriptionPaused` and `onSubscriptionResumed` in `auth.ts`, wired to `applySubscriptionEvent`; no projection change. Endpoint tests for paused alone, resumed alone and an older paused redelivered after the resume; a projection test that Polar's update + paused and update + resumed pairs each project once. `Sinwy.Shared` `better-auth` bumped; the lockfile only changed the declared range. Docs list the five handled events.
- Differs from plan: `better-auth` went to `^1.7.12`, not `^1.7.0`, to match the root exactly. `buildPolarDelivery`'s `as` now also takes `subscription.resumed`, so the resumed tests send the active fixture under that type until phase 4 captures a real one.
- Checked in the running app (simulated deliveries, backend only, no Polar call): seeded owner `YBEEXuOg6nHnxdZz5wI1s5H90Oa6Jeaa`, org `f5eb43c5-…`. Active, then paused (both deliveries 200; the update projected, the paused one logged the DEBUG "not newer" ignore) gave `paused` / no plan / still bound, and the org was inactive with its slot kept. A later active restored the plan and the org. Replaying the paused delivery with its original timestamp and webhook id changed nothing and logged no warning. A lone paused delivery, sent through `buildPolarDelivery` to a second seeded owner, projected on its own (INFO "Plan projected", org inactive). Not checked: a real `subscription.resumed` (phase 4). Toolkit gap, not fixed: the CLI always sends the update before the paused delivery, so a CLI-only run can't show whether `onSubscriptionPaused` is wired.
