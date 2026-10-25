# simulate-polar-webhook

```bash
bun run dev:simulate-polar-webhook --type <subscription.active|subscription.updated|subscription.revoked|subscription.paused> --org <organizationId> \
  [--subscription-id <id>] [--plan <starter|professional|enterprise>] [--timestamp <iso>] [--webhook-id <id>] [--url <backend url>]
```

This sends a signed Polar webhook to `POST /api/auth/polar/webhooks`, the endpoint Polar calls. The payload is a fixture recorded from a real sandbox delivery (`Sinwy.Backend/scripts/dev/fixtures/polar/`). Only the ids, `metadata.referenceId` (the org id), the product (this `.env`'s product for `--plan`, default `enterprise`) and the event `timestamp` are replaced (`--timestamp` also sets the subscription's `modified_at`), and the request is signed with `POLAR_WEBHOOK_SECRET`.

It prints JSON with `type`, `subscriptionId`, `timestamp`, `webhookId`, `status` and `response` for each delivery, and exits 1 unless every status is 200. `subscription.paused` makes two deliveries, as Polar does: a `subscription.updated` carrying the paused subscription, then the `subscription.paused` itself. `--webhook-id` applies to the second.

## The app's handling

- `subscription.active`, `subscription.revoked` and `subscription.updated` all project the payload's subscription onto the org. Status `active`, `trialing` or `past_due` makes the org `active`, with `plan` mapped from the product and `subscription_id` bound. `paused` makes it `inactive` with no `plan` but keeps `subscription_id` bound: the org is suspended. Any other status makes it `inactive` and clears both.
- The recorded `subscription.updated` is a cancellation (status `canceled`), so it makes the org `inactive` like a revoke.
- `subscription.paused` has no handler: the `subscription.updated` sent before it projects. The fixture is derived from a really paused sandbox subscription, not a captured delivery (its `source` says so).
- An event applies only if its subscription's `modified_at` (the `--timestamp`) is newer than `organization.subscription_status_at`. While an org is bound to a subscription, events for any other subscription are ignored, so revoke with the same `--subscription-id`.
- The endpoint answers 200 even for events it ignores or for an unknown org. **A 200 doesn't mean the status changed.** Check the result:
  ```bash
  psql service=sinwy_ro -c "SELECT status, plan, subscription_id, subscription_status_at FROM organization WHERE id = '<id>' LIMIT 1"
  ```

## Recipes

| Case | Command |
| --- | --- |
| Pay for an org | `--type subscription.active --org <id>` |
| Pay for a specific plan | `--type subscription.active --org <id> --plan starter` |
| Revoke the same subscription | `--type subscription.revoked --org <id> --subscription-id <id from the earlier output>` |
| Suspension takes effect (period end) | `--type subscription.paused --org <id> --subscription-id <id>` |
| Resume webhook | `--type subscription.active --org <id> --subscription-id <id>` (Polar sends `subscription.updated` with the active subscription) |
| Redelivery | repeat with the printed `--subscription-id`, `--timestamp` and `--webhook-id` |
| Late or out-of-order event | `--timestamp` earlier than the last applied event |

## Simulated vs real

This replaces the payment and Polar's delivery, not Polar itself. Suspend, undo and resume call Polar on the org's bound subscription, so they need a real sandbox subscription: with a simulated one they answer 422. It doesn't check:

- the plan page's checkout button (it creates the Polar checkout), the checkout page, Polar's redirect to `/checkout/success`, or the customer portal
- which events the sandbox endpoint is subscribed to, or whether its secret matches `.env`
- payload changes since the fixture was recorded (the fixture files record the capture date and the API version, which sets the payload shape)

If billing behaviour changed, the remaining real check is a sandbox checkout with webhooks delivered through `bun run start:localproxy` (ngrok). It needs the user: the sandbox webhook endpoint must point at the ngrok URL and be enabled. Compare the DB state it leaves with the simulated run. To refresh a fixture from the newest real delivery, run `bun run dev:capture-polar-fixture --type <event>`.
