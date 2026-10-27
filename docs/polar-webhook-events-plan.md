# Polar webhook events plan

Closes what's left of the Polar upgrade ticket after the SDK 1.x / plugin 2.x / better-auth 1.7 upgrade (e286841) and the per-user billing projection. Adds handlers for `subscription.paused` and `subscription.resumed`, trims both webhook endpoints to the five handled events and checks the billing flows against real sandbox deliveries. It also re-records the webhook fixtures from real deliveries at API version 2026-10 and adds `subscription.resumed` to the simulator.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [polar-webhook-events-log.md](polar-webhook-events-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Paused and resumed handlers | – | done | `feat(backend): project Polar subscription paused and resumed webhooks on their own` |
| 2 | Webhook endpoint configuration | 1 | done | `docs: enable the Polar sandbox webhook for the five handled events` |
| 3 | Real-delivery pass and fixture recapture | 2 | done | `feat(tooling): re-record the Polar webhook fixtures from real 2026-10 sandbox deliveries` |
| 4 | Real pause and resume, paused/resumed fixtures | 3, and the scheduled pause taking effect | done | `feat(tooling): capture the Polar paused and resumed fixtures from a real sandbox pause and resume` |
| 5 | Code review | 4 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **Five events, all handled.** Both endpoints subscribe to `subscription.active`, `.updated`, `.revoked`, `.paused` and `.resumed`. Every one is wired to `applySubscriptionEvent`, so a pause or resume doesn't depend on the `subscription.updated` Polar sends before it.
- **The sandbox endpoint stays enabled.** The developer runs `bun run start:localproxy` when they work on Polar locally. If Polar disables the endpoint after failed deliveries, they re-enable it.

### Defaults (not yet confirmed; change only if asked)

1. The webhook endpoints and `polarClient` stay on API version 2026-10, because the plugin parses deliveries with 2026-10 models (see Standing notes). Move them to 2027-01 only once the plugin does.
2. The customer portal pause stays off, as `docs/org-rules-map.md` (Default 3) already records. Suspend and resume happen in the app only.
3. Six orphaned sandbox subscriptions belonged to users no longer in the local DB. Revoked in phase 2 with the user's approval.
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
- Sandbox endpoint since phase 2: id `75e9e523-2402-4607-9c5c-6667068eba0c`, URL `https://unmathematically-unrotating-karson.ngrok-free.dev/api/auth/polar/webhooks` (the user's ngrok tunnel `sinwy`), format `raw`, API version `2026-10`, enabled, exactly the five events. A redelivery shows in `GET /v1/webhooks/deliveries` about 1 s after the call. The sandbox portal has `pause: false` and `update_plan: false`.
- Production endpoint: set by the user to the same five events, 2026-10, Raw, portal pause and plan switching off (phase 2 log).
- Pause and resume in Polar:
  - The API can only pause at the period end (`pause_at_period_end`, optional `resumes_at`). `resume: true` resumes at once, starting a new period and charging for it.
  - There is no immediate pause anywhere, the dashboard included (the user checked the docs in phase 2).
  - The e2e skill records a shortcut: PATCH the subscription's `current_billing_period_end` a minute ahead and Polar applies the period end within seconds. Phase 4 used it: the pause landed about 1 s after the PATCHed time.
  - Pausing sends `subscription.updated`, then `subscription.paused`. Resuming sends `subscription.updated`, then `subscription.resumed` (both about 1 s apart). Polar also emits `order.created` on resume, but the endpoints don't subscribe to it, so it is never delivered (phase 4 log).
  - The app's Suspend (`SUSPEND` in `Sinwy.Backend/modules/billing/service.ts`) schedules `pause_at_period_end`.
- Sandbox subscriptions since phase 4: 5 active, all belonging to local users. `fb855687-…` (user `J7NGTd1scSZ6jRJ0h3ym6vWn94fDbc9X`) was paused and resumed in phase 4 and now runs to 2026-11-27.
- Suspend and Resume write `user_subscription` from Polar's answer before the deliveries land, and the deliveries are then `outdated` (a debug line, no change). At checkout the `active` event has `modified_at: null`, so it is ordered by `created_at`, and Polar's extra `subscription.updated` right after projects again (phase 3 log).
- The reconcile heals only when the stored `subscription_status_at` is older than Polar's `modified_at`. Clearing `plan` alone isn't healed, and Billing then offers a checkout to a paying user (phase 3 log; for phase 5).
- The real checkout works without the user: the subagent typed the 4242 card through the e2e skill's Stripe iframe recipe.
- All five events are wired to `applySubscriptionEvent` (phase 1). An event whose `modified_at` equals the applied one is `outdated`, so Polar's update + paused/resumed pair projects once.
- With the tunnel up and the backend down, Polar's deliveries got 404 and then 400, and its retries (about 5 s, 15 s, 40 s, 45 s apart) succeeded once the backend was up (phase 4 log).
- Fixtures (`Sinwy.Backend/scripts/dev/fixtures/polar/`):
  - All five are captured from real deliveries at `apiVersion: 2026-10`: `active`, `updated` and `revoked` in phase 3, `paused` and `resumed` in phase 4.
  - The simulator sends `paused` and `resumed` as Polar does, each after a `subscription.updated` with the same data.
  - `subscription.updated.json` is a cancellation (status `canceled`), and the simulator tests rely on that.
  - `capturePolarFixture` takes the newest delivery of the type (any endpoint, failed ones included), so capture `subscription.updated` right after a revoke.

---

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
