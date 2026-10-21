# simulate-polar-webhook

```bash
bun run dev:simulate-polar-webhook --type <subscription.active|subscription.revoked> --org <organizationId> \
  [--subscription-id <id>] [--timestamp <iso>] [--webhook-id <id>] [--url <backend url>]
```

This sends a signed Polar webhook to `POST /api/auth/polar/webhooks`, the endpoint Polar calls. The payload is a fixture recorded from a real sandbox delivery (`Sinwy.Backend/scripts/dev/fixtures/polar/`). Only the ids, `metadata.referenceId` (the org id) and the event `timestamp` are replaced, and the request is signed with `POLAR_WEBHOOK_SECRET`.

It prints JSON with `subscriptionId`, `timestamp`, `webhookId`, `status` and `response`, and exits 1 unless the status is 200.

## The app's handling

- `subscription.active`, `subscription.revoked` and `subscription.updated` all project the payload's subscription onto the org. Status `active`, `trialing` or `past_due` makes the org `active`, with `plan` mapped from the product and `subscription_id` bound. Any other status makes it `inactive` and clears both.
- The fixtures use the sandbox Enterprise product. If `POLAR_PRODUCT_ENTERPRISE` in `.env` is a different product, the org becomes `active` with `plan` null and an error is logged.
- An event applies only if its `timestamp` is newer than `organization.subscription_status_at`. While an org is bound to a subscription, events for any other subscription are ignored, so revoke with the same `--subscription-id`.
- The endpoint answers 200 even for events it ignores or for an unknown org. **A 200 doesn't mean the status changed.** Check the result:
  ```bash
  psql service=sinwy_ro -c "SELECT status, plan, subscription_id, subscription_status_at FROM organization WHERE id = '<id>' LIMIT 1"
  ```

## Recipes

| Case | Command |
| --- | --- |
| Pay for an org | `--type subscription.active --org <id>` |
| Revoke the same subscription | `--type subscription.revoked --org <id> --subscription-id <id from the earlier output>` |
| Redelivery | repeat with the printed `--subscription-id`, `--timestamp` and `--webhook-id` |
| Late or out-of-order event | `--timestamp` earlier than the last applied event |

## Simulated vs real

This replaces the payment and Polar's delivery, not Polar itself. It doesn't check:

- the plan page's checkout button (it creates the Polar checkout), the checkout page, Polar's redirect to `/checkout/success`, or the customer portal
- which events the sandbox endpoint is subscribed to, or whether its secret matches `.env`
- payload changes since the fixture was recorded (the fixture files record the capture date, SDK version and API version)

If billing behaviour changed, the remaining real check is a sandbox checkout with webhooks delivered through `bun run start:localproxy` (ngrok). It needs the user: the sandbox webhook endpoint must point at the ngrok URL and be enabled. Compare the DB state it leaves with the simulated run. To refresh a fixture from the newest real delivery, run `bun run dev:capture-polar-fixture --type <event>`.
