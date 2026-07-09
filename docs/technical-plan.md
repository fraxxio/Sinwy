# Technical Plan — Auth & Organization Creation

Implements [user-creation-roadmap.md](./user-creation-roadmap.md), satisfies [user-flow-map.md](./user-flow-map.md).
Scope of this pass: **backend, through webhook activation** (flow map 1, 3, 5, 6, 7 server-side). Frontend is the next pass (Phase 4, outline only).

Already in place ([Sinwy.Backend/modules/auth/auth.ts](../Sinwy.Backend/modules/auth/auth.ts)):
email/password + `requireEmailVerification`, verification email sending, Google OAuth, organization plugin with `status` additional field (default `inactive`), org tables in [db/schema/organizationSchema.ts](../Sinwy.Backend/db/schema/organizationSchema.ts). No DB schema changes are needed in this pass.

---

## Phase 1 — Polar Integration (roadmap Steps 2–5, flow map 5–7)

### 1.1 Install

```bash
bun add @polar-sh/better-auth @polar-sh/sdk
```

### 1.2 Environment / config

Add to `appConfig` (lib/appConfig.ts) and `.env`:

- `POLAR_ACCESS_TOKEN` — Organization Access Token from Polar settings
- `POLAR_WEBHOOK_SECRET` — from the Polar webhook endpoint config
- `POLAR_SERVER` — `sandbox` | `production` (sandbox for dev; tokens/products are per-environment)

### 1.3 Polar dashboard (manual, once per environment)

- Create products: Starter, Professional, Enterprise (subscription pricing)
- Create webhook endpoint pointing at `<backend-url>/api/auth/polar/webhooks`, copy secret

### 1.4 Plugin config in `auth.ts`

Add to the `plugins` array:

```ts
polar({
	client: new Polar({ accessToken, server }),
	createCustomerOnSignUp: true, // Polar customer per user, mapped via externalId — no local mapping table
	use: [
		checkout({
			products: [
				{ productId: "<from dashboard>", slug: "starter" },
				{ productId: "<from dashboard>", slug: "professional" },
				{ productId: "<from dashboard>", slug: "enterprise" },
			],
			successUrl: "/checkout/success?checkout_id={CHECKOUT_ID}",
			authenticatedUsersOnly: true,
		}),
		portal(), // customer portal + subscription reads, used later for entitlement checks
		webhooks({
			secret: POLAR_WEBHOOK_SECRET,
			onSubscriptionActive,   // → org status "active"
			onSubscriptionRevoked,  // → org status "inactive"
		}),
	],
})
```

### 1.5 Webhook handlers (flow map 6–7)

Both handlers do the same projection (roadmap Step 5: status is a pure projection of subscription state):

1. Read `referenceId` (organization id) from the subscription metadata; if absent, ignore the event (subscription not tied to an org).
2. Update `organization.status` via Drizzle (`db.update(organization)...`) — this is our own field, direct update inside the auth module is fine.
3. Handlers must be idempotent (webhooks can be re-delivered); a plain status set already is.

Note: unpublishing public pages on `inactive` is enforced by *readers* of `status` (the future public-page serving checks status = active) — no action in the handler.

### 1.6 Routing check

The existing catch-all `/api/auth/*` route (modules/auth/routes.ts) already forwards POST/GET, so `/api/auth/polar/webhooks` works without new routes. Verify with a signed test event from the Polar dashboard.

### 1.7 Testing (write after phase is implemented)

**Not tested (library code):** checkout redirect, webhook signature verification, customer-on-signup, portal — Polar/better-auth internals.

**Design for testability:** the webhook handlers must be one-liners calling a plain exported function, e.g. `projectSubscriptionStatus(payload)` — that function holds all our logic and is what gets tested. Don't test through the HTTP webhook endpoint (that would mean forging signatures).

**Integration tests (`bun test` + test DB), the most important suite in the plan:**

1. subscription-active payload with `referenceId` → org row `status = "active"`
2. subscription-revoked payload → `status = "inactive"`
3. payload without `referenceId` → no-op, no throw
4. same event delivered twice → same end state, no error (idempotency)
5. `referenceId` pointing at a non-existent org → no throw (stale/foreign event)

**Optional smoke:** POST `/api/auth/polar/webhooks` with an invalid signature → rejected. Only proves route wiring; skip if 1.6's manual check passed.

---

## Phase 2 — Organizations Module (roadmap Step 1, flow map 5)

### 2.1 Lock down client-side creation

In the organization plugin options: `allowUserToCreateOrganization: false`.
All other org operations (members, invitations, active-org switching) stay on built-in better-auth endpoints.

### 2.2 New module `modules/organizations/`

Per the module pattern (`index.ts` public API, cross-module via services):

```
modules/organizations/
├── index.ts        # exports registerOrganizationRoutes + service
├── routes.ts
└── service.ts
```

### 2.3 `POST /api/organizations` — create (flow map 5)

1. Require session (`auth.api.getSession({ headers })`, 401 if none; better-auth already guarantees verified email for sessions).
2. Validate body with Zod: `{ name: string (1..100) }`. DTO type via `z.infer`.
3. Generate slug: slugify(name); on unique-collision append short random suffix and retry.
4. Create via `auth.api.createOrganization({ body: { name, slug, userId: session.user.id } })` — server-side call without session headers (required because client creation is disabled). Creator becomes owner; `status` defaults to `inactive`.
5. Return DTO: `{ id, name, slug, status }` — never the Drizzle row.

### 2.4 `GET /api/organizations/:id/status` — polling target (flow map 6)

1. Require session + membership in `:id` (member table lookup).
2. Return `{ status }`.

Used by the success page ("Activating your organization…" ~2s poll). No push/SSE — polling for seconds-scale latency.

### 2.5 Testing (write after phase is implemented)

**Not tested (library code):** session creation, email-verification enforcement, owner-membership mechanics inside `auth.api.createOrganization`.

**Unit tests (pure, no DB):**

1. slug generation: basic slugify, unicode/symbol-heavy names, name that strips to empty, collision → suffixed slug

**Integration tests (`bun test` + test DB, requests against the app):**

1. `POST /api/organizations` without session → 401
2. invalid body (missing/empty/too-long name) → 400
3. valid request → 201 with exactly `{ id, name, slug, status: "inactive" }` (no Drizzle internals leaking)
4. creator has an owner membership row for the new org
5. two orgs with the same name → distinct slugs
6. **built-in `organization.create` endpoint → rejected** — regression guard for `allowUserToCreateOrganization: false`; if someone drops that flag, this is the only thing that catches it
7. `GET /api/organizations/:id/status`: member → `{ status }`; non-member → 403/404; no session → 401

---

## Phase 3 — Verification (backend pass "done" criteria)

Manual/scripted against the running server (Polar sandbox):

1. Register (email/password) → verification email sent → cannot sign in before verifying.
2. Google OAuth sign-in → session works.
3. `POST /api/organizations` with session → org created, `status = inactive`, creator is owner member. Without session → 401. Duplicate name → distinct slug.
4. `authClient.organization.create` path → rejected (creation disabled).
5. Checkout: `authClient.checkout({ slug, referenceId: orgId })` → redirects to Polar sandbox checkout; complete test payment.
6. Webhook: subscription-active event → org `status = active`; revoke in Polar dashboard → `status = inactive`. Re-delivered event → no error.

### 3.1 Testing

This phase stays **manual** — items 1, 2, 5, 6 exercise external services (email delivery, Google OAuth, Polar sandbox checkout and webhook delivery) that automated tests can't reach and shouldn't fake. Items 3 and 4 are already automated by the Phase 1.7 and 2.5 suites; the manual pass here is the end-to-end confirmation that the pieces those suites test in isolation are wired together correctly.

**Test infrastructure note (applies to 1.7 and 2.5):** integration tests need their own Postgres database because they truncate tables between tests — pointing them at the dev database would wipe manually created dev state on every run. Same local container is fine: `CREATE DATABASE sinwy_test;`, tests use a `DATABASE_URL` pointing at it, schema pushed in a `bun test` preload/setup. Set this up once when writing the Phase 1 suite.

---

## Phase 4 — Frontend Pass (next pass, outline)

Consumes the finished backend; TanStack Start app.

1. Auth client with `polarClient()` + organization client plugins.
2. Register/login/verify screens (flow map 1, 3); registration source carried in `callbackURL` only (roadmap 1.4).
3. Post-login routing (flow map 4): active org → Organization Mode, else Customer Mode; mode = active organization context (roadmap §6).
4. Org creation page → `POST /api/organizations` → plan selection → `authClient.checkout({ slug, referenceId })` (flow map 5).
5. `/checkout/success` page: poll `GET /api/organizations/:id/status` until `active` (timeout fallback), then route to onboarding placeholder (flow map 6).

### 4.6 Testing (write after phase is implemented)

**Not tested:** screens/components, form rendering, better-auth client calls. No browser E2E framework in this pass — add Playwright later only if funnel regressions actually appear.

**Unit tests (`bun test` runs fine in the frontend workspace) — extract both as pure functions so they're testable without a browser:**

1. post-login routing decision: `(hasActiveOrg, orgCount, source?) → destination` — covers flow map 2 and 4 branches (discovery vs marketing first redirect, org → Organization Mode, none → Customer Mode)
2. success-page polling: with injected fetch + timers — resolves when status flips to `active`, gives up after timeout, survives a failed poll request in between

---

## Decisions this plan is bound by

- Org creation only via custom endpoint; created `inactive` before payment (roadmap Step 1).
- No local subscription tables; `organization.status` is the only billing projection (roadmap §7.2, Step 5).
- Registration source is transient, never persisted (roadmap 1.4).
- Entitlements: none yet — status is the only plan effect; org creation unlimited (roadmap §7.4).
