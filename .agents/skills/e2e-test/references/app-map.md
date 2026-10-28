# App Map

The web app runs on `http://localhost:3000`, which proxies `/api` to the backend on `http://localhost:3001`. Use the web app URL in the browser.

## Organization funnel

| Step | URL | Real or simulated |
| --- | --- | --- |
| Register | `/auth/register` | real; makes no Polar call: the sandbox customer is created at the first checkout or portal visit |
| Verify email | link from `dev:last-email` | real link, read from the console driver's outbox instead of an inbox |
| Log in | `/auth/login`, then `/auth/postlogin` | real; or `dev:login-as` |
| Create org | `/organizations/new` | real; takes a free slot when the owner has a plan, else stays a `draft` (inactive, no slot, setup unfinished) |
| Buy the plan | Account → Billing (`/account/billing`), plan cards → the plugin's `POST /api/auth/checkout` with `{ "slug": "starter" }` | real Polar sandbox checkout for the user's own plan; no `reference_id` |
| Pay | Polar checkout page, then `/checkout/success` | real card in the sandbox, or **simulated**: `dev:simulate-polar-webhook --type subscription.active --user <id>`. The success page waits for the plan, then activates the owner's oldest draft |
| Activate the org | Account → Organizations (`/account/organizations`), or `POST /api/account/organizations/<id>/activate` (owner) | real; takes one of the plan's slots (Starter 1, Professional 2, Enterprise 5) |
| Onboarding | `/organizations/<id>/onboarding` | real; opens for an active org or its owner's draft; finishing a draft's wizard takes a free slot |
| Dashboard | `/<org slug>` | real |

An org is `active` when it holds a slot (`organization.slot_held_at`), isn't scheduled for deletion, and its owner's plan grants access (`user_subscription.plan` set). The plan belongs to the user, not to an org. Billing (plan, invoices, payment method, suspend) lives on the owner's Account → Billing; org settings show the tier name to the owner and admins only.

## Where state lives

| What | Table (`Sinwy.Backend/db/schema/`) | Columns worth checking |
| --- | --- | --- |
| User | `"user"` (quote it) | `id`, `email`, `email_verified` |
| Session | `session` | `user_id`, `active_organization_id`, `expires_at` |
| Org | `organization` | `id`, `slug`, `slot_held_at`, `deletion_scheduled_at`, `onboarding_completed_at` |
| Plan | `user_subscription` | `user_id`, `subscription_id`, `plan`, `status`, `subscription_status_at`, `trial_used_at` |
| Org profile | `organization_profile` | `organization_id`, `city`, `country`, `email` |
| Membership | `member` | `organization_id`, `user_id`, `role` (`owner`, `staff`) |

```bash
psql service=sinwy_ro -c "SELECT id, slug, slot_held_at, deletion_scheduled_at, onboarding_completed_at FROM organization WHERE id = '<id>' LIMIT 1"
psql service=sinwy_ro -c "SELECT subscription_id, plan, status, subscription_status_at, trial_used_at FROM user_subscription WHERE user_id = '<id>' LIMIT 1"
```

Polar state (customers, subscriptions) lives in the Polar sandbox, not the DB. Check it through the Polar API or dashboard when it matters.
