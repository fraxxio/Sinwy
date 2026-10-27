# Polar webhook events plan

Closes what's left of the Polar upgrade ticket after the SDK 1.x / plugin 2.x / better-auth 1.7 upgrade (e286841) and the per-user billing projection. Adds handlers for `subscription.paused` and `subscription.resumed`, trims both webhook endpoints to the five handled events and checks the billing flows against real sandbox deliveries. It also re-records the webhook fixtures from real deliveries at API version 2026-10 and adds `subscription.resumed` to the simulator.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [polar-webhook-events-log.md](polar-webhook-events-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Paused and resumed handlers | – | done | `feat(backend): project Polar subscription paused and resumed webhooks on their own` |
| 2 | Webhook endpoint configuration | 1 | todo | |
| 3 | Real-delivery pass and fixture recapture | 2 | todo | |
| 4 | Real pause and resume, paused/resumed fixtures | 3, and the scheduled pause taking effect | todo | |
| 5 | Code review | 4 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **Five events, all handled.** Both endpoints subscribe to `subscription.active`, `.updated`, `.revoked`, `.paused` and `.resumed`. Every one is wired to `applySubscriptionEvent`, so a pause or resume doesn't depend on the `subscription.updated` Polar sends before it.
- **The sandbox endpoint stays enabled.** The developer runs `bun run start:localproxy` when they work on Polar locally. If Polar disables the endpoint after failed deliveries, they re-enable it.

### Defaults (not yet confirmed; change only if asked)

1. The webhook endpoints and `polarClient` stay on API version 2026-10, because the plugin parses deliveries with 2026-10 models (see Standing notes). Move them to 2027-01 only once the plugin does.
2. The customer portal pause stays off, as `docs/org-rules-map.md` (Default 3) already records. Suspend and resume happen in the app only.
3. Six orphaned sandbox subscriptions belong to users no longer in the local DB, and they keep renewing. Revoke them in phase 2, after the user confirms, so their renewals don't fail against a closed tunnel and disable the endpoint.
4. `order.created`, which Polar sends on resume, stays unhandled. The app's resume reads the subscription.

## Standing notes

- `@polar-sh/better-auth` 2.1.0 imports every SDK module from `@polar-sh/sdk/2026-10`, webhook parsing included. The SDK (1.0.2) also exports `2026-04` and `2027-01`; the Polar API spec is at 2027-01.
- The plugin's `/polar/webhooks` endpoint:
  - answers 200 `{ received: true }` for unknown event types and for events with no handler;
  - answers 403 on a bad signature and 400 on another parse error;
  - answers 500 when a handler throws.

  It types `onSubscriptionPaused` and `onSubscriptionResumed` with `webhooks.WebhookSubscriptionPausedPayload` / `...ResumedPayload`, whose `data` is a `Subscription`.
- Polar delivery:
  - There are no health checks or pings; Polar calls the endpoint only for a subscribed event.
  - A failed delivery is retried up to 10 times with exponential backoff.
  - After 10 consecutive failed deliveries the endpoint is disabled and all organization members get an email.
  - A failed delivery is still recorded with its payload, so `dev:capture-polar-fixture` works from it. A disabled endpoint records nothing.
  - Polar can redeliver an event: `POST /v1/webhooks/events/{id}/redeliver`, or from the dashboard.
- These endpoint fields can be changed through the API (`PATCH /v1/webhooks/endpoints/{id}`): `url`, `name`, `api_version`, `format`, `events`, `enabled`. Portal and subscription settings can only be changed in the dashboard.
- Sandbox endpoint as of 2026-10-27:
  - id `75e9e523-2402-4607-9c5c-6667068eba0c`, URL `https://sinwydev.dev/api/auth/polar/webhooks`;
  - format `raw`, API version `2026-10`, **disabled**, subscribed to 37 events;
  - its last deliveries (2026-10-23) failed with no HTTP code.
  - The sandbox portal has `pause: false` and `update_plan: false`.
- Pause and resume in Polar:
  - The API can only pause at the period end (`pause_at_period_end`, optional `resumes_at`). `resume: true` resumes at once, starting a new period and charging for it.
  - Pausing sends `subscription.updated`, then `subscription.paused`. Resuming sends `subscription.updated`, `subscription.resumed` and `order.created`.
  - The app's Suspend (`SUSPEND` in `Sinwy.Backend/modules/billing/service.ts`) schedules `pause_at_period_end`.
- Sandbox subscriptions as of 2026-10-27:
  - 11 are active, none paused.
  - 6 are orphaned (their external ids aren't local users), including the earliest renewal, `49cacf98-…` on 2026-11-04. The other five renew 2026-11-20 to 2026-11-26.
  - The local user whose period ends first is `J7NGTd1scSZ6jRJ0h3ym6vWn94fDbc9X` (`webdevrokas+seed-ff222823-user@gmail.com`), subscription `fb855687-b03c-43f5-b714-800fb113d778`, period end 2026-11-25 21:09 UTC.
- All five events are wired to `applySubscriptionEvent` (phase 1). An event whose `modified_at` equals the applied one is `outdated`, so Polar's update + paused/resumed pair projects once.
- Until phase 4 records a resumed fixture, tests send `subscription.resumed` as the active fixture with `as: "subscription.resumed"` on `buildPolarDelivery`. The CLI has no way to send `subscription.paused` without its preceding update (see the phase 1 log).
- Fixtures (`Sinwy.Backend/scripts/dev/fixtures/polar/`):
  - All four are at `apiVersion: 2026-04`.
  - `subscription.paused.json` is derived, not captured (its `source` says so).
  - `subscription.updated.json` is a cancellation (status `canceled`), and the simulator tests rely on that.
  - `capturePolarFixture` takes the newest delivery of the type, so capture `subscription.updated` right after a revoke.

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

---

## Phase 3: Real-delivery pass and fixture recapture

**Goal:** These flows are confirmed against real sandbox deliveries: sign-up, checkout, portal, account deletion and the reconcile. The `active`, `updated` and `revoked` fixtures are re-recorded at 2026-10, and a pause is scheduled for phase 4.

**Files:**
- `Sinwy.Backend/scripts/dev/capturePolarFixture.ts`
- `Sinwy.Backend/scripts/dev/fixtures/polar/subscription.{active,updated,revoked}.json`
- `Sinwy.Backend/scripts/dev/tests/simulatePolarWebhook.test.ts` and `capturePolarFixture.test.ts`
- `Sinwy.Backend/modules/billing/projection.ts`: `reconcileUserPlan`
- `Sinwy.Backend/modules/billing/service.ts`: `revokeAccountSubscriptions`, `SUSPEND`

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

---

## Phase 4: Real pause and resume, paused/resumed fixtures

**Goal:** A real pause makes the owner's orgs inactive and a real resume makes them active again. The simulator supports `subscription.resumed` from a captured fixture.

**Files:**
- `Sinwy.Backend/scripts/dev/simulatePolarWebhook.ts`: `polarFixtures`, `SENT_AFTER_AN_UPDATE`
- `Sinwy.Backend/scripts/dev/fixtures/polar/subscription.paused.json` (replace) and `subscription.resumed.json` (new)
- `Sinwy.Backend/scripts/dev/tests/simulatePolarWebhook.test.ts`
- `.agents/skills/e2e-test/references/simulate-polar-webhook.md`: the usage line, the paused note and the "Resume webhook" recipe

**Steps:**
- Run on or after the scheduled period end (2026-11-25 21:09 UTC), or straight after phase 3 if an immediate pause exists.
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

---

## Phase 5: Code review

**Goal:** The webhook handler change and the fixture-driven test changes have been reviewed for money and access regressions.

**Files:** The diffs of phases 1–4. `Sinwy.Backend/modules/auth/auth.ts` `webhooks(...)`; `Sinwy.Backend/modules/billing/projection.ts`.

**Steps:**
- Check that no new path can grant access to a paused subscription, or take it from an entitled one, through reordered or redelivered events.
- Check that `docs/org-rules-map.md` matches the final behaviour and the endpoint settings.

**Tests that matter:** Whatever the review finds untested.

**Done when:** Every finding is fixed or recorded as accepted, and `bun run verify` passes.

**Verify:** None.
