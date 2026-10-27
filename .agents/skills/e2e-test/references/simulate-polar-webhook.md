# simulate-polar-webhook

```bash
bun run dev:simulate-polar-webhook --type <subscription.active|subscription.updated|subscription.revoked|subscription.paused|subscription.resumed> --user <userId> \
  [--subscription-id <id>] [--plan <starter|professional|enterprise>] [--transfer-id <id>] [--timestamp <iso>] [--webhook-id <id>] [--url <backend url>]
```

This sends a signed Polar webhook to `POST /api/auth/polar/webhooks`, the endpoint Polar calls. The payload is a fixture recorded from a real sandbox delivery (`Sinwy.Backend/scripts/dev/fixtures/polar/`). Only the ids, the customer's `external_id` (the user id), the metadata (empty, or `transferId` with `--transfer-id`), the product (this `.env`'s product for `--plan`, default `enterprise`) and the event `timestamp` are replaced (`--timestamp` also sets the subscription's `modified_at`), and the request is signed with `POLAR_WEBHOOK_SECRET`.

It prints JSON with `type`, `subscriptionId`, `timestamp`, `webhookId`, `status` and `response` for each delivery, and exits 1 unless every status is 200. `subscription.paused` and `subscription.resumed` make two deliveries, as Polar does: a `subscription.updated` carrying the same subscription, then the event itself. `--webhook-id` applies to the second. Polar also sends `order.created` on a resume; the app doesn't handle it and the simulator doesn't send it.

## The app's handling

- `subscription.active`, `subscription.updated`, `subscription.revoked`, `subscription.paused` and `subscription.resumed` all project the payload's subscription onto the user's `user_subscription` row. Status `active`, `trialing` or `past_due` sets `plan` from the product and binds `subscription_id`: every org the user owns that holds a slot is `active`. `paused` clears `plan` but keeps `subscription_id` bound: the plan is suspended and those orgs are `inactive`, keeping their slots. Any other status clears both.
- The recorded `subscription.updated` is a cancellation (status `canceled`), so it ends the plan like a revoke.
- A second billable subscription for a user already bound to a live one is revoked and refunded in Polar, so with a simulated id that call fails and the webhook answers 500.
- `subscription.paused` and `subscription.resumed` project on their own; after the `subscription.updated` Polar sends before them with the same data, they are ignored as not newer.
- An event applies only if its subscription's `modified_at` (the `--timestamp`) is newer than `user_subscription.subscription_status_at`. While a user is bound to a subscription, events for any other one don't apply, so revoke with the same `--subscription-id`.
- The endpoint answers 200 even for events it ignores or for an unknown user. **A 200 doesn't mean anything changed.** Check the result:
  ```bash
  psql service=sinwy_ro -c "SELECT status, plan, subscription_id, subscription_status_at FROM user_subscription WHERE user_id = '<id>' LIMIT 1"
  ```

## Recipes

| Case | Command |
| --- | --- |
| Give a user a plan | `--type subscription.active --user <id>` |
| A specific plan | `--type subscription.active --user <id> --plan starter` |
| Revoke the same subscription | `--type subscription.revoked --user <id> --subscription-id <id from the earlier output>` |
| Suspension takes effect (period end) | `--type subscription.paused --user <id> --subscription-id <id>` |
| Resume takes effect | `--type subscription.resumed --user <id> --subscription-id <id>` |
| Redelivery | repeat with the printed `--subscription-id`, `--timestamp` and `--webhook-id` |
| Late or out-of-order event | `--timestamp` earlier than the last applied event |

## Simulated vs real

This replaces the payment and Polar's delivery, not Polar itself. Suspend, undo and resume call Polar on the user's bound subscription, so they need a real sandbox subscription: with a simulated one they answer 422. It doesn't check:

- the checkout itself (the plugin's `/checkout` creates it in Polar), the checkout page, Polar's redirect to `/checkout/success`, or the customer portal
- which events the sandbox endpoint is subscribed to, or whether its secret matches `.env`
- payload changes since the fixture was recorded (the fixture files record the capture date and the API version, which sets the payload shape)

If billing behaviour changed, the remaining real check is a sandbox checkout with webhooks delivered through `bun run start:localproxy` (ngrok). It needs the user to run `bun run start:localproxy`: the sandbox endpoint points at their ngrok URL, is enabled and subscribes to the five handled events. If Polar disabled it after failed deliveries, the user re-enables it. Compare the DB state it leaves with the simulated run. To refresh a fixture from the newest real delivery, run `bun run dev:capture-polar-fixture --type <event>`.
