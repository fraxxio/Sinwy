# seed-scenario

```bash
bun run dev:seed-scenario <user|owner-with-org|subscribed-org|pro-org|org-with-staff|bookable-org> [--staff <n>] [--url <backend url>]
```

This creates fresh users and an org through the backend's HTTP API, the way the browser does. It posts the sign-up form, follows the emailed verification link and calls the org endpoints. The backend must be running and `SEED_EMAIL_BASE` must be set in `Sinwy.Backend/.env`. Users get plus-aliases of that address, because Polar rejects domains that can't receive mail when a checkout creates the customer.

| Scenario | State |
| --- | --- |
| `user` | one verified user with no org (start here to test org creation in the browser) |
| `owner-with-org` | verified owner with no plan, org `inactive` without a slot, no onboarding (the state right after `/organizations/new`) |
| `subscribed-org` | as above, then a simulated Starter `subscription.active` for the owner, the org activated on its slot, profile filled in and onboarding complete |
| `pro-org` | `subscribed-org` with the owner on Professional instead of Starter (5 pages, `advanced-widgets`) |
| `org-with-staff` | `subscribed-org` plus `--staff` verified staff members (default 1); Starter seats 3, so `--staff 2` at most |
| `bookable-org` | `subscribed-org` in `Europe/Vilnius` with Mon–Sun 09:00–17:00 hours, an auto-confirmed "Haircut" (30 min, €25) and a "Colouring" that needs approval (90 min, €80); `organization` adds `timezone`, `hours` and `services` (ids, prices, `requiresApproval`) |

For an org that is active but still has onboarding to do, seed `owner-with-org`, run `dev:simulate-polar-webhook --type subscription.active --user <owner id>`, then `POST /api/account/organizations/<id>/activate` as the owner.

The output is JSON:

```json
{
	"scenario": "subscribed-org",
	"password": "Seed-1a2b3c4d-1",
	"organization": { "id": "…", "slug": "seed-1a2b3c4d", "status": "active", "subscriptionId": "…", "onboardingCompleted": true },
	"users": [{ "role": "owner", "userId": "…", "email": "you+seed-1a2b3c4d-owner@example.org" }]
}
```

- Pass a user's email to `dev:login-as --email`, or type it with `password` into the login form.
- Pass `subscriptionId` to `dev:simulate-polar-webhook --user <owner id> --subscription-id` to revoke the same subscription.

Caveats:

- A seeded subscription exists only in the DB, not in Polar. The customer portal shows nothing, the billing details on the subscription endpoint are `null`, plan changes fail and account deletion has nothing to revoke. To test billing behaviour, use a real sandbox checkout.
- Staff are added with Better Auth's server-side `addMember`, not through an invitation. To test invitations, invite from Team (or `POST /api/auth/organization/invite-member`) and read the link from the outbox.
- Unlike a browser login, seeded sessions have no `active_organization_id`. The app sets it when the user opens the plan, onboarding or dashboard routes.
