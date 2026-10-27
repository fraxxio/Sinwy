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


---

## Phase 2: Webhook endpoint configuration

**Goal:** The sandbox endpoint is enabled, points at the developer's tunnel and subscribes to the five handled events at 2026-10. Production matches, set by the user.

**Files:**
- Polar sandbox endpoint `75e9e523-…`, through the Polar Sandbox MCP `execute` (`PATCH /v1/webhooks/endpoints/{id}`) or the dashboard.
- `docs/org-rules-map.md`: the "Polar settings" block (line 473), which should record the endpoint events, the API version pin and the reason for it.
- `.agents/skills/e2e-test/SKILL.md` line 56 ("The sandbox webhook endpoint is disabled…").
- `.agents/skills/e2e-test/references/simulate-polar-webhook.md`: the "Simulated vs real" section (line 36).
- `README.md`: "Polar webhooks (optional)" (lines 68–89), whose step 3 says to point the URL in the dashboard.

**Steps:**
- Ask the user to confirm that `https://sinwydev.dev` is their tunnel's domain, then get their approval for the PATCH: events = the five, `api_version` 2026-10, `enabled` true.
- Ask the user to confirm revoking the 6 orphaned sandbox subscriptions (Default 3). Revoke only subscriptions whose `customer.external_id` isn't in the local `user` table, and list them before revoking.
- Ask the user to check the sandbox dashboard for a merchant **immediate** pause on a subscription. If it exists, record it in Standing notes: phase 4 can then run straight after phase 3 instead of waiting for 2026-11-25.
- Production has no MCP access. Give the user the exact settings to apply: same five events, 2026-10, portal pause off, plan switching off. Record in the log what they confirmed.
- Docs: the endpoint is enabled; deliveries arrive while `start:localproxy` runs; re-enable the endpoint if Polar disables it.

**Tests that matter:** None (configuration and docs).

**Done when:**
- `GET /v1/webhooks/endpoints` shows the sandbox endpoint enabled, at 2026-10, with exactly the five events.
- The user has confirmed the production settings.
- The docs describe the enabled endpoint, and `bun run verify` passes.

**Verify:** With the backend and `bun run start:localproxy` running, have Polar resend one recent subscription event to the endpoint, using `POST /v1/webhooks/events/{id}/redeliver` with user approval. The delivery should show HTTP 200 in `GET /v1/webhooks/deliveries`. This is real Polar and a real tunnel; there is no app UI flow.

### Log (2026-10-27, `docs: enable the Polar sandbox webhook for the five handled events`)
- Shipped: the sandbox endpoint now points at `https://unmathematically-unrotating-karson.ngrok-free.dev/api/auth/polar/webhooks`, enabled, 2026-10, Raw, exactly the five events, and is the sandbox's only endpoint. The six orphaned sandbox subscriptions (`49cacf98-…`, `e063a9eb-…`, `58a0e02d-…`, `b1f5c1a2-…` (customer webdevrokas@gmail.com), `a6682c99-…`, `d0ead039-…`) are revoked; each customer's external id was checked against the local `user` table first, and the endpoint was still disabled, so no deliveries went out. 5 active subscriptions remain, all local users. Docs: the endpoint block in `docs/org-rules-map.md`, the README ngrok steps (events, version, re-enabling), the e2e skill and the simulator reference.
- Production: the user confirmed the endpoint with the five events at 2026-10, Raw, enabled, its secret matching production's `POLAR_WEBHOOK_SECRET`, and portal pause and plan switching off.
- Differs from plan: the tunnel domain is the user's ngrok domain, not `sinwydev.dev`. No immediate pause exists (the user checked the docs), so the phase 4 pause still waits for a period end. `biome.json` now excludes `**/.claude/settings.local.json`: the user's new allow rule for the Polar MCP put that file in Biome's scope (Biome reads only the repo `.gitignore`, the file is ignored globally) and broke `bun run verify`. The first revoke attempt was blocked by the auto-mode classifier until the user added that rule.
- Checked in the running app: with the user's backend and ngrok running, Polar redelivered `subscription.revoked` event `9f503deb-…` (an unknown user); delivery `aad0dafc-…` got 200 `{"received":true}` within about 3 s, ngrok logged the same, and no `user` or `user_subscription` row changed. Not checked: the backend log of that request (the user started the backend without a log file the agent could read), and a real delivery for a local user (phase 3).
