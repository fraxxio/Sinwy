# Subscription & Billing — Backend Implementation Plan (Issue #31)

## Goal

By the end of this session the backend answers three questions for any
organization, cheaply and consistently:

1. **What plan is this organization on, and is it paid?** — served from our own
   database, never from a live Polar call, so it can be checked on every request.
2. **What is this organization allowed to use?** — a resolved feature list
   derived from the plan, shared with the frontend via `@sinwy/shared` so
   `<PlanGate>` and `requireFeature` agree by construction.
3. **What did this organization pay, and when does it renew?** — billing
   details and invoice history read from Polar on demand, for the billing page
   only.

Deliverables (from the issue):

- `Feature`, `PLAN_FEATURES` and `featuresFor()` in `@sinwy/shared`.
- `GET /api/organizations/:organizationId/subscription`.
- `requireFeature(feature)` middleware.
- `GET /api/organizations/:organizationId/invoices` (+ invoice download).

Plus what is needed to make those correct over time:

- `organization.plan` / `organization.subscription_id` projection columns.
- Webhook projection rewritten to derive from the subscription object, not the
  event name, and extended to plan changes.
- `POST /api/organizations/:organizationId/subscription/plan` for
  upgrade/downgrade (see Decision 6 — checkout cannot do this for paid plans).

## What already exists (do not rebuild)

| Concern | Where | Notes |
| --- | --- | --- |
| Polar SDK client | `modules/auth/polarClient.ts` | Comment there says to move it out once more Polar logic appears — that is now. |
| Plan slug → Polar product | `modules/auth/auth.ts` (`planProducts`) | Keyed by `PlanSlug`, env-driven. Needs a reverse lookup. |
| Checkout + portal + webhooks | `modules/auth/auth.ts` polar plugin block | `onSubscriptionActive` / `onSubscriptionRevoked` only. |
| Status projection | `modules/auth/subscriptionStatus.ts` | Writes `active`/`inactive` from the **event type**. |
| Checkout guard | `modules/auth/checkoutGuard.ts` | `billing:manage` + "org not already active". |
| Reconcile missed webhook | `modules/organizations/reconcileStatus.ts` | Inactive → asks Polar for an active sub, upgrades on evidence. |
| Revoke on account deletion | `modules/organizations/service.ts` | Lists by `metadata.referenceId`, revokes. |
| Membership guard chain | `modules/auth/requirePermission.ts` | `requireMember` → `Membership { organizationId, roles, status }` on ctx. |
| `billing:manage` permission | `@sinwy/shared` `PERMISSION_STATEMENTS` | Owner only. |

The roadmap rule stays in force: **organization billing state is a pure
projection of Polar**. We add fields to the projection; we do not create a
subscription table or make Polar calls in request guards.

## Design decisions

### 1. Where the plan lives: projection columns on `organization`

`requireFeature` will run on every gated request. Asking Polar there means
per-request latency, rate limits, and a Polar outage taking down the app.
Keeping the plan in the DB, written by the same webhook path that already
writes `status`, costs nothing at read time: `findMembership` already joins
`organization`, so `Membership` gains `plan` with zero extra queries.

Add to `organization`:

- `plan text null` — a `PlanSlug`, `null` when there is no active subscription.
- `subscription_id text null` — the Polar subscription currently backing the
  org. Unique partial index (`WHERE subscription_id IS NOT NULL`). Internal
  only; never exposed to the frontend.

Rejected: a live Polar lookup with an in-process cache (cache invalidation on
webhooks across instances is the same problem as a column, with more moving
parts); a `subscription` table (roadmap says no, and nothing needs history yet).

Expose `plan` through the organization plugin's `additionalFields` with
`input: false`, exactly like `status`, so `listOrganizations` /
`getFullOrganization` carry it and the org shell can render the banner and
`<PlanGate>` without an extra request. `OrganizationDto` and
`OrganizationSummary` get `plan: PlanSlug | null`. (Frontend must mirror the
field in `auth-client.ts` — cross-cutting note for the frontend half.)

### 2. Entitlements in `@sinwy/shared`

```ts
// Sinwy.Shared/types/plan/Feature.ts
export const FEATURES = [...] as const;      // kebab-case slugs
export type Feature = (typeof FEATURES)[number];

// Sinwy.Shared/types/plan/PlanFeatures.ts
export const PLAN_FEATURES: Record<PlanSlug, readonly Feature[]> = { ... };

/** [] when there is no plan: inactive organizations are entitled to nothing. */
export const featuresFor = (plan: PlanSlug | null): readonly Feature[] =>
	plan ? PLAN_FEATURES[plan] : [];
export const hasFeature = (plan: PlanSlug | null, feature: Feature) =>
	featuresFor(plan).includes(feature);
```

Mirror the shape of `PERMISSION_STATEMENTS` / `ROLE_PERMISSIONS` /
`hasPermission` so the two matrices read the same way and get the same kind of
pinned tests.

**Keep the first feature list tiny.** Only add a feature when a gate will
exist for it. Marketing copy in `PlanCards.tsx` is not the source of truth.
Suggested seed, matching the cards and what Phase 8 will gate:

| Feature | starter | professional | enterprise |
| --- | --- | --- | --- |
| `page-builder` (full customisation; starter keeps templates only) | – | ✓ | ✓ |
| `custom-domain` | – | ✓ | ✓ |
| `analytics-advanced` | – | ✓ | ✓ |
| `multi-location` | – | – | ✓ |

Tiers should be supersets; pin that in a test so a future edit can't
accidentally give starter something professional lacks.

**Not features:** numeric limits ("up to 3 members", "5 pages"). Those are a
different shape (`PLAN_LIMITS: Record<PlanSlug, { members: number | null; … }>`)
and are out of scope. Don't encode them as `members-15` features.

**Permission vs feature:** a permission is *who* in the org may act (role); a
feature is *what the org paid for* (plan). Both guards are needed on a gated
write: `requirePermission("pages:write")` then `requireFeature("page-builder")`.

### 3. Plan ↔ Polar product mapping becomes a leaf module

Move `planProducts` out of `auth.ts` into infrastructure alongside the client:

```
infrastructure/polar/
├── index.ts
├── polarClient.ts        # moved from modules/auth
└── planProducts.ts       # productIdFor(plan), planFor(productId)
```

`planFor(productId)` is a **many-to-one** lookup (`productId → PlanSlug | null`),
built from the env map. Today it is one product per plan, but `PlanCards` already
shows yearly prices; when yearly products arrive they map to the *same*
`PlanSlug` (entitlement identity) with a different checkout slug (payment
identity). Designing the reverse lookup as a function now makes that additive.
Unknown product → `null` + `error` log, never a throw in a webhook.

Keeping it in `infrastructure/` (like email and storage) rather than inside a
module avoids the auth ↔ billing import cycle described in Decision 8.

### 4. Webhook projection: derive from the subscription object

Today `projectSubscriptionStatus` picks `active`/`inactive` from
`payload.type`. Replace it with one projector that reads the subscription
itself:

```ts
projectSubscription(sub: Subscription /* payload.data */)
  status = ["active", "trialing", "past_due"].includes(sub.status) ? "active" : "inactive"
  plan   = status === "active" ? planFor(sub.productId) : null
  subscriptionId = status === "active" ? sub.id : null
```

Register it for `onSubscriptionActive`, `onSubscriptionRevoked`,
`onSubscriptionUpdated` (fires on product change — the upgrade/downgrade path),
and keep `onSubscriptionCanceled` / `onSubscriptionUncanceled` going through the
same function (cancel-at-period-end keeps `status: "active"` until Polar revokes,
so nothing changes and that is correct).

Why: every handler applying the same idempotent state function means duplicate
delivery, overlapping events (Polar emits `subscription.updated` alongside the
specific event) and any event we haven't subscribed to yet all converge on the
same result. The event name is only used for logging.

**Stale-event guard:** a `revoked`/`inactive` projection is only applied when
`payload.data.id` equals the stored `subscription_id` (or it is null). Without
this, a late-arriving revocation of an *old* subscription would deactivate an
org that re-checked-out and is happily paying on a new one. This is the main
reason to store `subscription_id`. Log a `warn` when ignoring.

`reconcileInactiveStatus` must call the same projector (with the subscription
it found) instead of `setStatus` — otherwise a reconciled org is active with
`plan: null` and zero features.

Organization module API changes from `setOrganizationStatus(id, status)` to
`applySubscriptionProjection(id, { status, plan, subscriptionId })` (single
`UPDATE`, returns whether a row matched, same idempotency as today). Keep the
existing tests' mental model: "same event twice → same end state".

### 5. `GET /organizations/:organizationId/subscription`

Middleware: `requireAuth`, `requireMember`. Any member may read (the banner
and `PlanGate` need it); only `billing:manage` may change it.

```ts
export type OrganizationSubscriptionDto = {
	status: OrganizationStatus;       // our projection
	plan: PlanSlug | null;
	features: readonly Feature[];     // featuresFor(plan)
	billing: {
		subscriptionStatus: SubscriptionBillingStatus; // Polar's, e.g. "active" | "past_due" | "trialing" | "canceled"
		amount: number;                // integer minor units, as Polar sends it
		currency: string;
		interval: "month" | "year";
		currentPeriodEnd: string;      // ISO
		cancelAtPeriodEnd: boolean;
		endsAt: string | null;         // ISO
	} | null;
};
```

`status`, `plan`, `features` come from `Membership` (DB, always present).
`billing` is a live `polarClient.subscriptions.get({ id: subscriptionId })`
and is `null` when there is no subscription **or when Polar fails** (log
`warn`). The billing page then shows "details unavailable" while the rest of
the app — which only reads the projection — is unaffected. Do not surface a
Polar outage as a 5xx on this endpoint; the projection half is still valid.

Keep money as integers + currency and dates as ISO strings (matches the
existing `completedAt` convention); the frontend formats.

The DTO deliberately has no `renewalDate` field name: `currentPeriodEnd` is
the renewal date when `cancelAtPeriodEnd` is false and the end date when it is
true. Naming it by what Polar means avoids a lie on cancelled subscriptions.

### 6. Upgrade / downgrade: `subscriptions.update`, not checkout

Polar's checkout `subscriptionId` parameter "must be on a free pricing"; a new
checkout for an already-subscribed org would create a **second** subscription
(and our guard rightly rejects it). Paid → paid plan changes go through
`polarClient.subscriptions.update({ id, subscriptionUpdate: { productId, prorationBehavior } })`.

```
POST /api/organizations/:organizationId/subscription/plan   { plan: PlanSlug }
```

- `requireAuth`, `requirePermission("billing:manage")`.
- Org inactive → `409` "no active subscription; start checkout instead".
- Same plan as current → `400`.
- Call Polar, return `202` with the current projection; the
  `subscription.updated` webhook writes the new plan. The frontend polls
  `/subscription` (same pattern as the checkout success page). Alternatively
  apply the projection immediately from the returned `Subscription` object —
  the projector is idempotent so both may run. Recommended: do both; it removes
  the polling wait on the happy path and the webhook backstops it.
- `prorationBehavior`: `"prorate"` (immediate, prorated invoice) is the
  simplest first behaviour. Whether downgrades should instead wait for period
  end is a product decision — see Open questions.

So the flows are: **inactive org → checkout** (initial purchase and
re-checkout after revocation, guard unchanged) and **active org → plan change
endpoint**. The issue's frontend line "Upgrade / downgrade → Polar checkout"
needs to be read that way.

### 7. Invoices: proxied from Polar, scoped to the organization

The Polar plugin's `/customer/orders/list` and `portal()` are **per Polar
customer, and the customer is the user** (`externalCustomerId = user.id`).
A user who owns two organizations would see both orgs' orders mixed together.
The org-scoped list must be ours:

```
GET /api/organizations/:organizationId/invoices?page=&limit=
```

- `requireAuth`, `requirePermission("billing:manage")` (invoices carry billing
  name/address — not for staff).
- `polarClient.orders.list({ subscriptionId, sorting: ["-created_at"], page, limit })`.
  Filtering by `subscriptionId` (the stored one) is exact. Filtering by
  `metadata.referenceId` would also cover subscriptions from *before* a
  re-checkout, but whether renewal orders inherit checkout metadata must be
  verified in the sandbox first; if they do, prefer it, otherwise list the
  org's subscriptions (`metadata.referenceId`, `active` unset) and pass the id
  array. Decide once, in the repository-style function, with a comment.
- Cap `limit` (e.g. 50). Map to a DTO — never return the Polar `Order`
  (it embeds the customer object with email/address):

```ts
export type InvoiceDto = {
	id: string;                  // Polar order id
	number: string;              // invoiceNumber
	createdAt: string;
	status: "pending" | "paid" | "refunded" | "partially_refunded" | "void";
	totalAmount: number;
	currency: string;
	billingReason: "purchase" | "subscription_create" | "subscription_cycle" | "subscription_update";
	downloadable: boolean;       // isInvoiceGenerated
};
```

Download:

```
GET /api/organizations/:organizationId/invoices/:orderId/download
```

- Same guards. Fetch the order, **verify it belongs to the org** (its
  `subscriptionId`/`metadata.referenceId` matches) — never trust `orderId`
  alone, it is a cross-tenant read otherwise. Mismatch → `404`.
- `orders.invoice({ id })` returns a short-lived presigned URL: respond `302`
  to it (or `{ url }` — pick one for the frontend; `302` lets a plain
  `<a href>` work). Never embed URLs in the list response, they expire.
- If `isInvoiceGenerated` is false: call `orders.generateInvoice` and return
  `202` so the frontend can retry. Generation needs a billing name/address on
  the order; when Polar refuses, surface `409` with Polar's message so the user
  is pointed at the portal to fill it in.

### 8. Module layout: a `billing` module, Polar as infrastructure

Polar-specific logic is now spread over `auth` and `organizations`. Consolidate:

```
infrastructure/polar/           # client + product map (leaf, no module imports)
modules/billing/
├── index.ts
├── routes.ts                   # /subscription, /subscription/plan, /invoices, /invoices/:id/download
├── controller.ts
├── service.ts                  # getSubscription, changePlan, listInvoices, invoiceDownload
├── projection.ts               # projectSubscription (webhook + reconcile + changePlan)
├── reconcile.ts                # moved from organizations/reconcileStatus.ts
├── checkoutGuard.ts            # moved from auth
├── invoices.ts                 # Polar order queries + DTO mapping
└── tests/
modules/auth/requireFeature.ts  # next to requirePermission — see below
```

`@billingModule` alias in `import_map.json` and `tsconfig.json`.

**Import direction and the cycle trap.** `auth.ts` must import the webhook
projector and checkout guard from billing; billing routes import `requireAuth`
/ `requireMember` from auth. The same auth ↔ organizations cycle exists today
and works because every cross-import is used *lazily* (inside a function or
hook body). Keep it that way: `auth.ts` may only reference billing exports
inside `hooks`/`webhooks` callbacks. Anything `auth.ts` needs **at module
evaluation time** (the checkout `products` array) must come from
`infrastructure/polar`, which imports nothing from `modules/`. If this rule is
broken, a test that happens to import `@billingModule` before `@authModule`
fails with a TDZ `ReferenceError` — that's the symptom to recognise.

**`requireFeature` lives in `auth`, not `billing`.** It is a guard on
`Membership` (like `requirePermission`) and needs only `@sinwy/shared`. Putting
it there means the page builder in Phase 8 imports one thing
(`@authModule`) for both guards and never depends on billing internals.

```ts
export const requireFeature =
	(feature: Feature): Middleware =>
	(ctx, next) =>
		requireMember(ctx, () =>
			hasFeature(membershipFrom(ctx).plan, feature)
				? next()
				: Promise.resolve(fail("Your plan doesn't include this feature", 402, PLAN_UPGRADE_REQUIRED)),
		);
```

`402` with a shared `code` constant (`API_CODES.PLAN_UPGRADE_REQUIRED` in
`@sinwy/shared`) lets `<PlanGate>` and the API client distinguish "upgrade"
from "not allowed" (`403`) and "org inactive" (`409`, already in use). If
`402` is felt to be too unusual, `403` + the code works equally; the code is
what matters. Since `featuresFor(null) = []`, an inactive org fails this
guard too — no separate status check in gated routes.

Organizations module keeps only what is organization data: the projection
setter in its repository/service and the status endpoint (which now calls
billing's reconcile). `getCheckoutOrganization` (checkout id → org id) moves
to billing as well.

### 9. Close the Polar plugin's unscoped subscription list

`GET /api/auth/customer/subscriptions/list?referenceId=<orgId>` in
`@polar-sh/better-auth` lists by metadata with **no membership check** — any
signed-in user can read any organization's subscription. Either block the
`referenceId` query in the existing `hooks.before` middleware (same place the
checkout guard lives) or require membership there via `resolveMembership`.
Blocking is simpler; our `/subscription` endpoint is the supported read. Add a
test that it is denied.

## API summary

| Method | Path | Guard | Returns |
| --- | --- | --- | --- |
| GET | `/api/organizations/:organizationId/subscription` | member | `OrganizationSubscriptionDto` |
| POST | `/api/organizations/:organizationId/subscription/plan` | `billing:manage` | `202` + `OrganizationSubscriptionDto` |
| GET | `/api/organizations/:organizationId/invoices` | `billing:manage` | `{ items: InvoiceDto[]; page; limit; total }` |
| GET | `/api/organizations/:organizationId/invoices/:orderId/download` | `billing:manage` | `302` → presigned PDF, `202` generating, `404` not this org's |

Shared types added: `Feature`, `FEATURES`, `PLAN_FEATURES`, `featuresFor`,
`hasFeature`, `OrganizationSubscriptionDto`, `InvoiceDto`,
`InvoiceListDto`, `changePlanBody` (zod), `PLAN_UPGRADE_REQUIRED` code.

## Implementation order

Each step leaves `bun run verify` green.

1. **Shared entitlements** — `Feature`, `PLAN_FEATURES`, `featuresFor`,
   `hasFeature`, pinned matrix test (supersets, every feature appears in at
   least one plan). Add `plan` to `OrganizationDto`/`OrganizationSummary`.
2. **Infrastructure** — `infrastructure/polar/` with the client and
   `productIdFor`/`planFor`; `auth.ts` uses it for the checkout `products`
   array. Delete `modules/auth/polarClient.ts`; update `@authModule` re-export
   consumers.
3. **Schema** — `plan`, `subscription_id` columns + partial unique index;
   `bun run db:generate`; `additionalFields.plan` in the organization plugin;
   `findMembership` selects `plan`; `Membership.plan`; `toPlanSlug` lenient
   parser (unknown → `null` + warn). Update `test/helpers.ts` / `fakeCtx` users.
4. **Projection** — `modules/billing/projection.ts` +
   `applySubscriptionProjection` in organizations; rewrite
   `subscriptionStatus.test.ts` into `projection.test.ts` with full payloads
   (status, productId, id). Wire `onSubscriptionUpdated/Canceled/Uncanceled`.
   Move and adapt `reconcileStatus`.
5. **`requireFeature`** — in auth, tests mirroring `requirePermission.test.ts`
   (no plan → 402, plan without feature → 402, with feature → next, non-member → 404).
6. **Subscription endpoint** — service + controller + route; tests with
   `spyOn(polarClient.subscriptions, "get")` for the DTO mapping and the
   Polar-failure → `billing: null` path.
7. **Plan change endpoint** — `spyOn(polarClient.subscriptions, "update")`;
   role/inactive/same-plan rejections; projection applied from the response.
8. **Invoices** — list + download with `spyOn(polarClient.orders, …)`; the
   cross-tenant download test is mandatory.
9. **Plugin hardening** — block/scope `referenceId` on the plugin's
   subscription list; test.
10. **Docs** — update `user-creation-roadmap.md` §5 step 5 and §7.2 ("plans
    entitle nothing else yet" is no longer true), `.env.example` unchanged
    unless yearly products are added.

## Things to watch so this holds up as the app grows

- **Never call Polar from a guard or hot path.** Entitlement checks read
  `Membership`; only the billing page and explicit billing actions talk to
  Polar. If someone later "just adds" a Polar call to `requireFeature`, every
  gated request inherits Polar's latency and availability.
- **State comes from the object, not the event.** Any new webhook handler must
  go through `projectSubscription`. Handlers that branch on `payload.type`
  reintroduce ordering bugs.
- **Per-subscription guard on deactivation.** Keep the `subscription_id`
  equality check; it is the only thing preventing a stale revocation from
  killing a re-subscribed org. Also log if an `active` projection arrives for an
  org that already has a *different* active `subscription_id` — that is the
  double-purchase race (two tabs on checkout) and needs a manual refund in
  Polar; make it visible.
- **`status` and `plan` mean different things.** `status` = "management
  features usable" (also `past_due`/`trialing`); `plan` = "which feature set".
  Don't derive one from the other outside the projector, and don't gate on
  `status` in a route that should gate on a feature.
- **Product IDs are per environment.** Sandbox and production products differ;
  the reverse map must always be built from the same env vars as the forward
  map. An unknown product must log at `error` level and result in `plan: null`,
  not a thrown webhook (Polar would retry forever) and not a wrong plan.
- **Plan identity ≠ product identity.** When monthly/yearly products appear,
  extend `planFor` (many-to-one) and the checkout slug list, not `PLAN_SLUGS`.
  `PlanSlug` is what the org is entitled to; the product is how they pay.
- **Never expose Polar objects.** `Order` and `Subscription` embed the
  customer (email, billing address) and internal ids. Map to DTOs in the
  billing module; `OrganizationSubscriptionDto` and `InvoiceDto` are the
  contract.
- **Presigned URLs expire.** Fetch on click via the download endpoint; never
  store or list them.
- **Money is integer minor units.** Pass Polar's integers through untouched;
  formatting is a frontend concern. No floating-point arithmetic on amounts.
- **Rate limits.** `/subscription` is cheap (one `get`), invoices are
  paginated with a capped limit. If the frontend ever polls `/subscription`
  (after a plan change), it polls the projection half; consider a
  `?billing=false` flag later if that becomes noisy.
- **The auth ↔ billing cycle.** Cross-module imports used at module evaluation
  time will break in a test-dependent order. Eval-time needs come from
  `infrastructure/polar` only.
- **Tests stay offline.** All Polar reach is via `spyOn(polarClient.*)` or
  `mock.module`, as the existing tests do; `createCustomerOnSignUp` is why
  helpers forge sessions instead of signing up.
- **Additive DTO changes only.** The frontend banner, `<PlanGate>` and the
  success-page poll all read `status`/`plan`; keep those field names stable and
  add rather than rename.

## Open questions (decide before step 6/7)

1. **Plan change mechanism** — recommended: our `POST …/subscription/plan`
   calling `subscriptions.update`. Alternative: rely on Polar's customer
   portal to switch products (no code, but the portal is per user and shows all
   orgs' subscriptions; the user could change the wrong one).
2. **Downgrade timing** — immediate with proration (simplest; recommended for
   now), or schedule for period end? Polar exposes `pendingUpdate` on the
   subscription, but whether `subscriptions.update` can request a deferred
   change needs checking in the sandbox.
3. **Initial `FEATURES`** — accept the four-row seed above, or start with
   `page-builder` alone and grow at Phase 8?
4. **Invoice list filter** — all orders, or `paid`/`refunded` only (hide
   `pending`/`void`)? Recommended: return all with `status`, let the UI decide.
5. **`402` vs `403`** for plan gating — recommended `402` + shared code.

## Definition of done

- `bun run verify` exits 0.
- New tests cover: feature matrix invariants; projection for
  active/updated/revoked/stale-revoked/unknown-product; `requireFeature`
  branches; subscription DTO with and without Polar; plan change guards;
  invoice list mapping and cross-tenant download denial; plugin list route
  denied.
- Manual sandbox pass: checkout → org active with plan; change plan → webhook
  updates plan; cancel in portal → still active until period end, `billing`
  shows `cancelAtPeriodEnd`; revoke → inactive, `plan: null`; invoice download
  works for a generated invoice.
- Roadmap doc updated so it no longer claims plans entitle nothing.
