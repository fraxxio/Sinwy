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
| Dashboard | `/dashboard/<org slug>` | real |

An org is `active` when it holds a slot (`organization.slot_held_at`), isn't scheduled for deletion, and its owner's plan grants access (`user_subscription.plan` set). The plan belongs to the user, not to an org. Billing (plan, invoices, payment method, suspend) lives on the owner's Account → Billing; org settings show the tier name to the owner and admins only.

## Pages and the page editor

| Step | URL | Notes |
| --- | --- | --- |
| Pages list | `/dashboard/<org slug>/pages`, new page at `/pages/new` | the plan caps the count (Starter 1, Professional 5, Enterprise 25) |
| Page detail | `/dashboard/<org slug>/pages/<id>` | title, slug, SEO, publish; the Content section's "Edit content" button opens the editor |
| Page editor | `/dashboard/<org slug>/pages/<id>/edit` | fills the window. Left: Add (block drawer) and Layers; middle: the canvas in `iframe#preview-frame`; right: Block settings. Header: Desktop/Tablet/Phone, Undo, Redo, Save |
| Public page | `/<org slug>/<page slug>` | serves the published version |

- Add a block by its card's Add button (after the selected block) or by dragging the card onto the canvas. Booking needs `premium-blocks` (Professional and up); on Starter it's a locked tile that opens an upgrade dialog and can't be dragged.
- Save is manual (Save or Ctrl/⌘+S); the header says "Unsaved changes" or "All changes saved". A refused save (409 newer version, 402 plan, 400 invalid) shows a toast and keeps the edits unsaved.
- Keys outside text fields: Delete/Backspace delete, ↑/↓ select, Alt+↑/↓ move, Esc selects the parent, Ctrl/⌘+Z and Ctrl/⌘+Shift+Z undo and redo.
- Driving it: inner coordinates are scaled (`locator.boundingBox()` gives page coordinates); blocks are `[data-puck-component="<block id>"]`, the root zone `[data-puck-dropzone="root:default-zone"]`. Scripted drags need a 2 px move at the target before the release. `Sinwy.WebFrontend/e2e/editor-fixtures.ts` has working helpers.

## Where state lives

| What | Table (`Sinwy.Backend/db/schema/`) | Columns worth checking |
| --- | --- | --- |
| User | `"user"` (quote it) | `id`, `email`, `email_verified` |
| Session | `session` | `user_id`, `active_organization_id`, `expires_at` |
| Org | `organization` | `id`, `slug`, `slot_held_at`, `deletion_scheduled_at`, `onboarding_completed_at` |
| Plan | `user_subscription` | `user_id`, `subscription_id`, `plan`, `status`, `subscription_status_at`, `trial_used_at` |
| Org profile | `organization_profile` | `organization_id`, `city`, `country`, `email` |
| Membership | `member` | `organization_id`, `user_id`, `role` (`owner`, `staff`) |
| Page | `page` | `id`, `organization_id`, `slug`, `status`, `published_version_id` |
| Page versions | `page_content` | `page_id`, `version`, `content` (the block document, JSON) |

```bash
psql service=sinwy_ro -c "SELECT id, slug, slot_held_at, deletion_scheduled_at, onboarding_completed_at FROM organization WHERE id = '<id>' LIMIT 1"
psql service=sinwy_ro -c "SELECT subscription_id, plan, status, subscription_status_at, trial_used_at FROM user_subscription WHERE user_id = '<id>' LIMIT 1"
```

Polar state (customers, subscriptions) lives in the Polar sandbox, not the DB. Check it through the Polar API or dashboard when it matters.
