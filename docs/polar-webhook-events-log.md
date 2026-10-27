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

## Phase 3: Real-delivery pass and fixture recapture

**Goal:** These flows are confirmed against real sandbox deliveries: sign-up, checkout, portal, account deletion and the reconcile. The `active`, `updated` and `revoked` fixtures are re-recorded at 2026-10, and a pause is scheduled for phase 4.

**Files:**
- `Sinwy.Backend/scripts/dev/capturePolarFixture.ts` and its test `scripts/dev/tests/capturePolarFixture.test.ts`
- `Sinwy.Backend/scripts/dev/fixtures/polar/subscription.{active,updated,revoked}.json`
- `Sinwy.Backend/scripts/dev/simulatePolarWebhook.ts` (`buildPolarDelivery` overrides ids, product, `modified_at`, customer `external_id` and metadata; anything else comes from the fixture) and `scripts/dev/tests/simulatePolarWebhook.test.ts`
- `Sinwy.Backend/modules/billing/projection.ts`: `reconcileUserPlan` (line 240, logs "Plan taken from Polar after a missed webhook")
- `Sinwy.Backend/modules/billing/service.ts`: `revokeAccountSubscriptions`, `SUSPEND` (line 457)
- Polar sandbox through the MCP `execute` (the user allowed it in `.claude/settings.local.json`): deliveries, customers, subscriptions

**Steps:**
- This phase needs the user: the tunnel must run for the whole session, and the checkout uses Polar's sandbox test card.
- Order matters for capture. Do the checkout first and capture `subscription.active`. Do the account deletion last, then capture `subscription.updated` and `subscription.revoked` at once (see Standing notes).
- Check the reconcile with real Polar: clear `plan` on a user with a live sandbox subscription through `sinwy_rw`, then load Account → Billing.
- Schedule the phase 4 pause: in the app, log in as the user from Standing notes (period end 2026-11-25) and Suspend. Skip this if phase 2 found an immediate pause.
- Diff the new fixtures against the old ones. Adjust the simulator or tests only where the 2026-10 shape changed a field they rely on. Record the notable shape differences in the log.

**Tests that matter:**
- The simulator suite passes on the re-recorded fixtures, especially the `updated` = cancellation expectations and the signature tests.

**Done when:**
- Each flow below gave the expected DB state with 200 deliveries.
- The three fixtures show `apiVersion: 2026-10`, the pause is scheduled, and `bun run verify` passes.

**Verify:** Real sandbox and a real tunnel; nothing is simulated.
1. **Sign-up:** create an account in the app. A Polar customer appears with `external_id` = the user id.
2. **Checkout:** buy a plan from Account → Billing. `subscription.active` is delivered with 200, `user_subscription` gets `plan` and `subscription_id`, and the org is `active`.
3. **Portal:** "Manage in Polar" opens the sandbox portal and returns to `/auth/postlogin`.
4. **Reconcile:** set `plan` to null via `sinwy_rw`, then load Billing. The plan is restored, and the log shows "Plan taken from Polar after a missed webhook".
5. **Account deletion:** delete the account. The subscription is revoked in Polar, the `updated` and `revoked` deliveries get 200 (unknown user, ignored), and the customer is deleted and anonymized.

### Log (2026-10-27, `feat(tooling): re-record the Polar webhook fixtures from real 2026-10 sandbox deliveries`)
- Shipped: `subscription.active`, `.updated` and `.revoked` fixtures re-captured at 2026-10 from real deliveries (events `871ce3c6-…`, `c06631d7-…`, `022512a2-…`). Their shape matches 2026-04 except that `data.metadata.referenceId` is gone (the simulator replaces `metadata` anyway). `updated` is still a cancellation, so no simulator or test change was needed. The phase 4 pause is scheduled on `fb855687-…` (Suspend in the app at 17:06Z, `pause_at_period_end=true`, period end 2026-11-25 21:09 UTC).
- Differs from plan:
  - The real flows ran before `bun run verify`, because the fixtures come out of them.
  - The checkout didn't need the user: the subagent typed the 4242 card through the Stripe iframes.
  - The reconcile step as written can't pass. Clearing only `plan` leaves `subscription_status_at` equal to Polar's `modified_at`, so `writeUserSubscription` returns `outdated` and Billing shows "Choose a plan" to a paying user. It healed once `subscription_status_at` was also set older (17:02:32), which is what a missed webhook leaves. This is moved to phase 5 as a decision.
  - The portal button is "Manage billing on Polar".
- Checked in the running app (real sandbox, user's backend and ngrok, subagent with the e2e skill), all deliveries 200:
  - Sign-up `webdevrokas+p3-1cdfa082@gmail.com` (user `Uia740bPLegnUp27WlizZfCSODOx6XQT`) created Polar customer `5e7fe1e3-…` with `external_id` = user id.
  - Checkout (Starter): `subscription.active` delivered, `user_subscription` got `plan=starter` and `subscription_id=2fd5e4cc-…`, and the org `a5caba31-…` took its slot. The backend log shows the `active` delivery projected at 17:02:34.47. It carries `modified_at: null`, so the projection used `created_at` (17:02:32.436). Polar's extra `subscription.updated` (`modified_at` 17:02:33.759) projected again at 17:02:35.88, when the slot was taken.
  - Portal: opened `sandbox.polar.sh/sinwydev/portal` with no email code; its back link is `localhost:3000/auth/postlogin`.
  - Suspend on the seed user: "Subscription suspend applied" at 17:06:19.058. The `subscription.updated` delivery at 17:06:19.136 was ignored as not newer. Billing shows "Suspension scheduled" with Undo.
  - Account deletion: the subscription is `canceled` in Polar (revoked), `updated` and `revoked` are delivered, and `GET /v1/customers/5e7fe1e3-…` is 404. The customer is anonymized (email `…@anonymized.polar.sh`, hashed name) but keeps `external_id` = the deleted user id (phase 5). The `user` and `user_subscription` rows are gone, and the org is scheduled for deletion with its slot released.
  - Backend log (pasted by the user): "Plan taken from Polar after a missed webhook" at 17:05:33.486, two "Subscription for an unknown user" warnings (status `canceled`) at 17:07:18.5 and 17:07:19.5, and no errors. The 17:04:12 Billing loads after the `plan`-only clear log "Ignored subscription state not newer than the applied one".
  - Not checked: real Resend delivery of the verification and deletion emails (console driver).
  - Seen on the way: Base UI logs a `nativeButton` console warning 191× on `/auth/goodbye`, because `goodbye.tsx` lines 43 and 63 render a `Link` through `Button` without `nativeButton={false}`. It is outside this plan.

## Phase 4: Real pause and resume, paused/resumed fixtures

**Goal:** A real pause makes the owner's orgs inactive and a real resume makes them active again. The simulator supports `subscription.resumed` from a captured fixture.

**Files:**
- `Sinwy.Backend/scripts/dev/simulatePolarWebhook.ts`: `polarFixtures` (line 12), the `as` option (line 34, drop `"subscription.resumed"` once the fixture exists) and `SENT_AFTER_AN_UPDATE` (line 38)
- `Sinwy.Backend/scripts/dev/fixtures/polar/subscription.paused.json` (replace) and `subscription.resumed.json` (new), written by `bun run dev:capture-polar-fixture --type <type>`
- `Sinwy.Backend/scripts/dev/tests/simulatePolarWebhook.test.ts`: the paused and resumed tests (lines 121–196) that send the active fixture `as: "subscription.resumed"`
- `.agents/skills/e2e-test/references/simulate-polar-webhook.md`: the usage line (line 4), the two-delivery note (line 10), the derived-fixture note (line 17) and the recipe table (line 31)
- `Sinwy.Backend/modules/billing/service.ts`: `RESUME` (line 503), which the Billing Resume button runs
- Polar sandbox subscription `fb855687-…` (Standing notes), through the MCP `execute`

**Steps:**
- Run after the PATCHed period end (2026-10-27 17:43:42 UTC, Standing notes).
- If the tunnel was down when the pause took effect, redeliver the `updated` and `paused` events once it's up. Capture works from the failed deliveries.
- Resume in the app (Account → Billing → Resume), which charges the test card. Then capture `subscription.paused` and `subscription.resumed`.
- The simulator sends `subscription.resumed` the way it sends `subscription.paused`: a `subscription.updated` first, with the same data.

**Tests that matter:**
- Simulated `subscription.resumed` restores the plan on the bound subscription.
- An older `subscription.paused` sent after it changes nothing.

**Done when:**
- Real deliveries of `updated` + `paused` and `updated` + `resumed` + `order.created` all got 200, and the DB followed them.
- Both fixtures are captured at 2026-10, with no `source: derived` left, and `bun run verify` passes.

**Verify:** Real sandbox and a real tunnel. Start from the user whose pause was scheduled in phase 3.
1. **Pause:** after the period end, `user_subscription` shows `status=paused`, `plan` null and `subscription_id` still set. The user's orgs are `inactive` and keep their slots, and Billing shows the plan as suspended.
2. **Resume:** click Resume. Polar charges, the three deliveries get 200, the plan returns, the orgs are `active`, and Billing shows the active plan.

Then, simulated: `--type subscription.resumed` on a seeded paused user gives the same end state.

### Log (2026-10-27, `feat(tooling): capture the Polar paused and resumed fixtures from a real sandbox pause and resume`)
- Shipped:
  - `subscription.paused.json` re-captured from the real delivery (event `910b1874-…`) and `subscription.resumed.json` captured (event `5ef3b8ae-…`), both at 2026-10. No `source: derived` is left.
  - The simulator's fixtures include `subscription.resumed`, sent after a `subscription.updated` like `paused`. The `as: "subscription.resumed"` option is gone.
  - The tests send the real resumed fixture, alone and as Polar sends it. The older-paused-after-resume test now asserts the full state.
  - The e2e skill's simulator reference is updated: usage, the two-delivery note and the resume recipe.
- Differs from plan:
  - Done-when expected three resume deliveries. Only `subscription.updated` and `subscription.resumed` arrive: `order.created` isn't on the endpoints' event list, which is what the Decisions want (five events). It isn't a missing delivery.
  - The user owned no orgs. So org `c87f9887-…` (`phase4-pause`) was created for them through the API after the pause, and its `slot_held_at` was set by hand to stand for a slot held before it. It read `inactive` while paused and `active` after the resume.
  - The subagent ran only the real part of Verify. The simulated line ran inline after the code change, because the Resume click can't be repeated and the resumed fixture came out of it.
- Checked in the running app (real sandbox, ngrok, backend and frontend started by the agent):
  - Pause: the PATCHed period end (17:43:42Z) applied at once. `subscription.updated` (17:43:43.7) and `subscription.paused` (17:43:44.8) both got 200. The first projected `paused`, `plan` null, `subscription_id` kept, and the second was `outdated`.
    - The 17:40 PATCH's `subscription.updated` had failed with 404/400 while the backend was down. It succeeded on retry at 17:43:21 and projected `active`.
  - Billing showed "Resume your plan / €9.00 / month" ("Your plan is suspended, so every organization you own is offline"), and Account → Organizations showed the org as Suspended.
  - Resume (subagent, e2e skill) at 17:47:02Z: "Subscription resume applied" projected `active`, `plan=starter` from Polar's answer. `subscription.updated` (17:47:04.0) and `subscription.resumed` (17:47:05.1) got 200 and were both `outdated`.
    - The org read `active`, and Billing showed "Starter, Active, 1 of 1 organizations active, Renews on Nov 27, 2026". No WARN/ERROR in the backend log.
  - Simulated, on seeded owner `8pXzMUSTSr15GMic6mADLWeVy2N2dKt3` (subscription `500c251b-…`, org `d4ab104b-…`): `--type subscription.paused`, then `--type subscription.resumed --plan starter`. Every delivery got 200. The states were paused/inactive, then active/starter/bound/`active` with the slot kept, the same end state as the real run.
  - Charge: Polar created the resume order `SINWYDEV-WSOEARWQFZ-0002` (`subscription_cycle`, €9.00) at 18:02:03Z, 15 min after the resume. It was `pending`, then `paid` within about 10 s, and Billing's invoice list shows it.

## Phase 5: Code review

**Goal:** The webhook handler change and the fixture-driven test changes have been reviewed for money and access regressions.

**Files:**
- The diffs of phases 1–4: `git diff 301d1db..HEAD -- Sinwy.Backend .agents`
- `Sinwy.Backend/modules/auth/auth.ts`: `webhooks({...})` (line 334), the five handlers
- `Sinwy.Backend/modules/billing/projection.ts`: `applySubscriptionEvent` (line 204), `reconcileUserPlan` (line 240)
- `Sinwy.Backend/modules/billing/repository.ts`: `writeUserSubscription` (line 110), the `outdated` check behind the reconcile gap
- `Sinwy.Backend/modules/billing/service.ts`: `SUSPEND` (line 457), `UNSUSPEND` (474), `RESUME` (503), which project Polar's answer before the webhook
- `docs/org-rules-map.md`: §8 Suspend, resume… (line 266) and §12 Polar's part (line 454)

**Steps:**
- Check that no new path can grant access to a paused subscription, or take it from an entitled one, through reordered or redelivered events.
- Decide on the reconcile gap from phase 3: a row with `plan` null but a current `subscription_status_at` isn't healed (`reconcileUserPlan` → `writeUserSubscription`, `repository.ts:166`).
- Decide whether the deleted Polar customer may keep `external_id` = the deleted user's id (phase 3 log).
- Check that `docs/org-rules-map.md` matches the final behaviour and the endpoint settings.

**Tests that matter:** Whatever the review finds untested.

**Done when:** Every finding is fixed or recorded as accepted, and `bun run verify` passes.

**Verify:** None.

### Log (2026-10-27, `docs: record the Polar webhook review and its accepted gaps`)
- Shipped: a review only; no code change was needed.
  - No new path grants a paused subscription access or takes access from an entitled one. `subscription.paused` and `.resumed` carry the same subscription as the `subscription.updated` Polar sends just before them, so their handlers reach no state `updated` couldn't already reach. `writeUserSubscription` applies only state strictly newer than `subscription_status_at`, so redeliveries, the pair's second event and older reordered events are `outdated`. Tests cover each: an older active after the pause, an older paused after the resume, the pair projecting once, revoked before an older active, and a late retry.
  - A paused subscription stays bound, and the checkout guard counts it as billable. A suspended user can't buy a second plan, so the second-plan refund path isn't reachable from a pause.
  - Reconcile gap: accepted. `plan` null with a current `subscription_status_at` comes only from a hand edit. The other source is a product that maps to no plan, and re-projecting can't heal that one anyway. A real missed webhook leaves an older timestamp, which heals. While `subscription_id` stays bound the checkout guard refuses a second purchase, so the user loses no money. Forcing fresh Polar reads to apply would race with a newer webhook (a revoke landing between the read and the write would grant the plan back), so the ordering stays. Recorded in `docs/org-rules-map.md` §14.
  - Deleted Polar customer keeping `external_id`: accepted. Better Auth user ids are random and never reused, the app keeps no row for the deleted user, and late deliveries for that customer are ignored as an unknown user. Recorded in `docs/org-rules-map.md` §11.
  - `docs/org-rules-map.md`: §8 and §12 match the code and the endpoint settings. §14 no longer says the sandbox endpoint is disabled.
- Differs from plan: nothing. Tests: the review found no untested path for the new handlers.
  - Also accepted: a raced second plan whose predecessor ended after the second plan's last `modified_at` is ordered behind the predecessor's end. That second plan stays unprojected until Polar modifies it again (its renewal). Reaching it takes a two-tab checkout and then a revoke of the first plan within seconds, before the second plan's webhooks land. It isn't in the map.
- Checked in the running app: nothing. Verify was "None"; `bun run verify` exited 0.
