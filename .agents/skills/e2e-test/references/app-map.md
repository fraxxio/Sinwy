# App Map

The web app runs on `http://localhost:3000`, which proxies `/api` to the backend on `http://localhost:3001`. Use the web app URL in the browser.

## Organization funnel

| Step | URL | Real or simulated |
| --- | --- | --- |
| Register | `/auth/register` | real; sign-up also creates a real Polar sandbox customer |
| Verify email | link from `dev:last-email` | real link, read from the console driver's outbox instead of an inbox |
| Log in | `/auth/login`, then `/auth/postlogin` | real; or `dev:login-as` |
| Create org | `/organizations/new` | real; the org starts `inactive` |
| Choose plan | `/organizations/<id>/plan` | the button starts a real Polar sandbox checkout |
| Pay | Polar checkout page | **simulated**: skip it and run `dev:simulate-polar-webhook --type subscription.active --org <id>` |
| Activation | `/checkout/success?checkout_id=…` | reached only after a real checkout; it polls `GET /api/organizations/<id>/status` |
| Onboarding | `/organizations/<id>/onboarding` | real; redirects to `/plan` unless the org is `active` |
| Dashboard | `/<org slug>` | real |

`/auth/postlogin` sends the user to the plan page if their org isn't `active`, to the org dashboard if it is, and to `/account` if they have no org.

In the simulated path, the org is `inactive` on the plan page. Run the webhook, then reload `/organizations/<id>/plan`: an `active` org redirects to onboarding. In the real path, Polar redirects to `/checkout/success`.

## Where state lives

| What | Table (`Sinwy.Backend/db/schema/`) | Columns worth checking |
| --- | --- | --- |
| User | `"user"` (quote it) | `id`, `email`, `email_verified` |
| Session | `session` | `user_id`, `active_organization_id`, `expires_at` |
| Org | `organization` | `id`, `slug`, `status`, `plan`, `subscription_id`, `subscription_status_at`, `onboarding_completed_at` |
| Org profile | `organization_profile` | `organization_id`, `city`, `country`, `email` |
| Membership | `member` | `organization_id`, `user_id`, `role` (`owner`, `staff`) |

```bash
psql service=sinwy_ro -c "SELECT id, slug, status, plan, subscription_id, subscription_status_at, onboarding_completed_at FROM organization WHERE id = '<id>' LIMIT 1"
```

Polar state (customers, subscriptions) lives in the Polar sandbox, not the DB. Check it through the Polar API or dashboard when it matters.
