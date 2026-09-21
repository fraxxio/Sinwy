# Subscription & Billing — Frontend Implementation Plan (Issue #31)

Companion to `subscription-billing-backend-plan.md`. The backend plan owns the
API contract; this document only consumes it. Where the two must agree on a
detail that the backend plan left open, the choice is called out under
"Cross-cutting asks" so both halves are implemented against the same answer.

## Goal

By the end of this session the org dashboard knows, without extra requests,
what the organization is entitled to, and reacts to it everywhere:

1. **An inactive organization is unmistakable and recoverable.** A persistent
   banner across the org shell, write controls disabled, and a one-click path
   back to checkout for whoever holds `billing:manage`.
2. **A plan-gated feature explains itself.** `<PlanGate feature="…">` renders
   the feature for plans that include it and an honest upgrade prompt for the
   rest, using the same `PLAN_FEATURES` matrix as the backend's
   `requireFeature`, so the UI never promises what the API will refuse.
3. **The owner can see and change what they pay for.** `/settings/billing`
   shows plan, price, renewal/end date and status, lets the owner switch plan,
   open Polar's portal and download invoices.

Deliverables (from the issue):

- `/$organizationSlug/settings/billing`: current plan, price, renewal date,
  status badge.
- Upgrade / downgrade from the billing page.
- "Manage billing" → Polar customer portal.
- Invoice history with downloads.
- Persistent banner + read-only mode across the org shell when
  `organization.status === "inactive"`, with a re-checkout CTA.
- Reusable `<PlanGate feature="…">`.

Plus what is needed to make those hold up:

- `plan` mirrored into `auth-client.ts` and parsed once in the org shell's
  `beforeLoad`, so entitlement state rides the existing route context.
- One hook (`useEntitlements`) and one rule for read-only mode, with tests, so
  future write surfaces have a single thing to call.
- Pure, tested helpers for money, subscription status wording and "which plan
  do I need for this feature", kept out of components.

## What already exists (do not rebuild)

| Concern | Where | Notes |
| --- | --- | --- |
| Org shell + route context | `org-dashboard/routes/_shell.tsx` | `setActive` / `getFullOrganization` returns the org with `status`; context is `{ session, organization, member }`. `ssr: false`. |
| Role-based `can()` | `shared/lib/auth/permissions.ts` (`usePermissions`) | Reads `member.roles` from route context via `useRouteContext({ strict: false })`. |
| Route guard | `shared/lib/auth/protected-route.ts` (`requirePermission`) | Redirects to Overview + parks a toast in `access-denied.ts`. |
| Nav filtering | `shell/nav-filter.ts`, `org-dashboard/lib/sections.ts` | Billing nav item already gated by `billing:manage`; `sections.test.ts` pins nav ↔ sections. |
| Billing page stub | `org-dashboard/routes/_shell.settings.billing.tsx` | Route, guard and crumb exist; body is an `EmptyState`. |
| Plan catalogue + cards | `organizations/components/PlanCards.tsx` | `plans` (slug, name, prices, bullets), `getPlanName`, monthly/yearly toggle, `pendingSlug`/`onChoosePlan`. |
| Checkout | `organizations/routes/$id.plan.tsx` | `authClient.checkout({ slug, referenceId })`; redirects to onboarding when the org is already active. This **is** the re-checkout page. |
| Post-payment poll | `checkout/lib/poll-until-active.ts` + `checkout/routes/success.tsx` | Bounded 2 s poll with cancellation; phases for unknown/unreachable/timed-out. |
| API envelope | `shared/lib/api.ts` | `api<T>()` never throws; returns `ApiResponse<T>` with `code`. |
| Query pattern | `account-dashboard/lib/account-queries.ts` | `queryOptions` + key object; `useMutation` with `onSettled` invalidation in `SessionsSection.tsx`. |
| Settings layout | `account-dashboard/components/settings/SettingsSection.tsx`, `ContentBox` | Section header + action slot; `ContentBox className="divide-y"` stacks sections. |
| Portal endpoint | `@polar-sh/better-auth` `portal()` | `authClient.customer.portal()` → `{ url, redirect: true }`; the client plugin navigates the tab. No `returnUrl` configured today. |
| Toasts, badges, dialogs, skeletons | `shared/components/ui/*` | `Badge` variants: default / secondary / destructive / outline. |

## Contract consumed from the backend

From the backend plan; field names here are the ones the UI binds to, so a
rename on either side is a typecheck failure via `@sinwy/shared`.

| Source | Gives the frontend | Used by |
| --- | --- | --- |
| `organization.status`, `organization.plan` (better-auth `additionalFields`) | Entitlement state, free with the shell load | banner, read-only rule, `<PlanGate>`, switcher |
| `featuresFor` / `hasFeature` / `PLAN_FEATURES` / `Feature` (`@sinwy/shared`) | The gate itself | `<PlanGate>`, `minimumPlanFor()` |
| `GET /organizations/:id/subscription` → `OrganizationSubscriptionDto` | Live billing details (`billing` may be `null` on Polar failure) | billing page only |
| `POST /organizations/:id/subscription/plan` `{ plan }` → `202` + DTO | Plan change | change-plan dialog |
| `GET /organizations/:id/invoices?page&limit` → `InvoiceListDto` | Invoice table | billing page |
| `GET /organizations/:id/invoices/:orderId/download` | PDF handoff (`202` generating, `409` needs billing details) | invoice row |
| `API_CODES.PLAN_UPGRADE_REQUIRED` (`402`) and the existing `409` "no active plan" | Distinguish "upgrade", "reactivate" and "forbidden" | mutation error handling |
| `authClient.customer.portal()` | Polar portal (per **user**, all their orgs) | "Manage billing" |

## Design decisions

### 1. Entitlement state rides the route context, not a query

The shell already loads the organization on every entry
(`setActive` / `getFullOrganization`). Once the backend exposes `plan` as an
`additionalField`, the org shell has `status` and `plan` at zero extra cost.
Mirror the field in `auth-client.ts` next to `status`:

```ts
plan: { type: "string", input: false, required: false },
```

Parse once, in `_shell.tsx` `beforeLoad`, and put a normalised object in the
context so nothing downstream touches raw strings:

```ts
const entitlements = {
	status: toOrganizationStatus(data.status),
	plan: toPlanSlug(data.plan),          // lenient: unknown → null (shared helper from backend step 3)
};
return { ...ctx, organization: data, member, entitlements };
```

`OrgRouteContext` (the type `requirePermission` guards against) stays
`{ organization: { slug }, member }`. `$id.plan.tsx` and
`$id.onboarding.tsx` build that shape by hand and must keep compiling; the new
field is added to the *shell's* context only.

Rejected: fetching `/subscription` in the shell (one Polar-touching request per
dashboard entry, and the shell would go red when Polar is down); a react-query
"entitlements" query (a second cache for something the router already holds —
two sources of truth to invalidate).

**Consequence to design around:** route context is a snapshot. After a plan
change, a re-checkout, or a `409` from the API ("no active plan"), call
`router.invalidate()` so the shell's `beforeLoad` re-runs. This is the one
invalidation rule; don't add per-component refetches.

### 2. `useEntitlements()` next to `usePermissions()`

```ts
// shared/lib/auth/entitlements.ts
export function useEntitlements() {
	const entitlements = useRouteContext({
		strict: false,
		select: (context) => context.entitlements ?? INACTIVE,   // outside the shell → entitled to nothing
	});
	return {
		status: entitlements.status,
		plan: entitlements.plan,
		isActive: entitlements.status === "active",
		has: (feature: Feature) => hasFeature(entitlements.plan, feature),
	};
}
```

Same shape and placement as `usePermissions` so the two read alike:
`can(permission)` = *who may*, `has(feature)` = *what the org paid for*,
`isActive` = *is the org paid at all*. Keep them separate hooks; a feature
check that also needs a role check calls both, exactly like the backend
stacks `requirePermission` then `requireFeature`.

### 3. Read-only mode is one rule, applied through `usePermissions`

"Inactive" per the roadmap: data kept, management gated. In UI terms: reads
render, writes don't. The rule must live in one place or every future write
button becomes a chance to forget it.

```ts
// shared/lib/auth/read-only.ts  (pure, tested)
/** While inactive only reads and billing management remain; every other action is off. */
export const isAllowedWhileInactive = (permission: Permission) =>
	permission.endsWith(":read") || permission === "billing:manage";
```

`usePermissions()` gains a second function:

```ts
return {
	roles,
	can,                                                         // role only: nav, routes, reading
	canAct: (permission) =>                                      // role + org active: mutation controls
		can(permission) && (isActive || isAllowedWhileInactive(permission)),
	isActive,
};
```

`can` stays role-only on purpose: the sidebar, the route guards and read
views must keep working while inactive (the Team page is `people:manage`; a
read-only org should still *show* the team). `canAct` is what disables the
"Invite", "Save", "Publish" controls. Rule of thumb for reviewers: a
`useMutation` in the org shell without a `canAct` (or `has`) next to it is a
bug.

Today the dashboard has no write surfaces (every section is an `EmptyState`),
so this session delivers the mechanism, the banner and the tests — not a sweep
of components. Phase 8's page builder is the first real consumer.

Backstop for anything that slips through: the backend answers `409` on writes
to an inactive org. Add a small `handleOrganizationInactive(res, router)`
helper used by org-shell mutations: on that `409` show the toast *and*
`router.invalidate()` so the banner appears even if the revocation webhook
landed mid-session.

### 4. Banner: a slot on `AppShell`, content owned by `org-dashboard`

`AppShell` is shared by both dashboards and knows nothing about
organizations. Give it a `banner?: ReactNode` slot rendered between the header
and the page body (sticky, full width, `role="status"`). `OrganizationShell`
decides what goes in it:

```tsx
<AppShell
	banner={!entitlements.isActive && <InactiveOrganizationBanner organization={organization} />}
	…
/>
```

`InactiveOrganizationBanner` (`org-dashboard/components/`) reads
`usePermissions().can("billing:manage")`:

- owner: "This organization has no active plan. Data is kept but changes are
  paused." + **Choose a plan** → `/organizations/$id/plan`.
- everyone else: same message + "Ask an owner to renew the subscription."

It is a banner, not a modal: the point of read-only mode is that people can
still look. No dismiss button — it is the state of the org, not a
notification.

### 5. Re-checkout reuses the funnel's plan page

`$id.plan.tsx` already: requires `billing:manage`, refuses when the org is
active, starts checkout with `referenceId = organizationId`, and the success
page polls status and routes on. That is the re-checkout flow; the banner and
the billing page's "Choose a plan" both link there. Two small things to fix
so it reads right the second time around:

- The success page always navigates to onboarding. When
  `onboardingCompletedAt` is set, go to the dashboard instead
  (`getFullOrganization` after activation gives both slug and the field).
- Accept an optional `?intent=renew` search param on the plan page to swap the
  hero copy ("Pick a plan to reactivate *Acme*") and hide `FunnelProgress`.
  Keep it a presentational switch, not a second page.

Do not build a checkout flow inside the dashboard: better-auth's checkout is
a full-page redirect anyway, and the checkout guard on the backend is the
same for both entries.

### 6. Plan change: our endpoint, a compact dialog, bounded poll

Per the backend's Decision 6, an active org changes plan through
`POST …/subscription/plan`, never through checkout. The UI:

- `ChangePlanDialog` on the billing page: one row per `PLAN_SLUGS` entry
  (name, catalogue price for the current interval, feature deltas from
  `PLAN_FEATURES`), current plan marked and disabled, one **Switch** button.
  Not the marketing `PlanCards`: three wide cards do not fit a dialog, and a
  settings page should not re-sell.
- Confirm step with honest copy driven by the backend's proration decision
  (default: "Takes effect now. You'll be charged or credited the prorated
  difference on your next invoice."). Word it from a constant so the copy
  changes in one place when Open question 2 in the backend plan is settled.
- `useMutation` → on `202`, apply the returned DTO to the subscription query
  cache, `router.invalidate()`, then poll `/subscription` until
  `plan === target` (bounded, ~10 × 2 s) in case the projection came from the
  webhook only. Generalise `pollUntilActive` into `pollUntil(read, predicate)`
  and keep the existing test.
- Errors: `409` → "No active subscription" + link to the plan page; `400`
  same plan → should be impossible from the UI, show the message; anything
  else → message + retry. Do not navigate away on failure.

Interval (monthly ↔ yearly) is **not** offered here: there is one product per
plan today and the endpoint takes `{ plan }` only. Show the current interval
from `billing.interval` as text. When yearly products land, the dialog gains
an interval toggle and the body a field — additive.

### 7. Manage billing: same-tab redirect to the portal

`authClient.customer.portal()` returns `{ url, redirect: true }` and the
better-auth client navigates. Keep that; it matches how checkout leaves the
app. Button label "Manage billing on Polar", helper text "Payment method,
billing address and receipts for all your subscriptions." — the portal is per
user and lists every organization the user pays for, so someone with two orgs
must pick the right one there. Say so rather than pretend it is scoped.

Rejected: opening in a new tab. The URL only arrives after an async call, so
the tab must be pre-opened synchronously and populated later; popup blockers
make this flaky, and there is no state on the billing page worth preserving.

Needs the backend to configure `portal({ returnUrl })` so the portal's back
link exists (see Cross-cutting asks).

### 8. Billing page composition

Route stays `_shell.settings.billing.tsx` (guard `billing:manage`, crumb
"Billing"). Body is `ContentBox className="divide-y"` with sections built on a
shared `SettingsSection` (lift the one in `account-dashboard` to
`shared/components/SettingsSection.tsx` — it is generic and both dashboards
now need it):

```
org-dashboard/
├── components/billing/
│   ├── CurrentPlanSection.tsx     # plan name, price/interval, status badge, renews/ends on, actions
│   ├── ChangePlanDialog.tsx
│   ├── InvoicesSection.tsx        # table + pagination + download
│   └── InactivePlanSection.tsx    # "No active plan" + Choose a plan (rendered instead of CurrentPlan)
├── lib/
│   ├── billing-queries.ts         # billingKeys, subscriptionQuery(orgId), invoicesQuery(orgId, page)
│   ├── subscription-status.ts     # describeSubscription(dto) → { label, variant, detail }  (pure)
│   └── download-invoice.ts        # fetch → { url } | generating | needs-details | error  (pure over api())
```

Data flow on the page:

- `entitlements` from route context decides *which* top section renders
  (inactive → `InactivePlanSection`, no request needed).
- `subscriptionQuery` (`staleTime` ~30 s, no `refetchInterval`) feeds
  `CurrentPlanSection`. `billing === null` while active → render the plan and
  a muted "Billing details are unavailable right now" with a retry; the page
  must never look broken because Polar is.
- `invoicesQuery` is paginated by `page` in **route search**
  (`validateSearch: z.object({ page: z.number().int().min(1).catch(1) })`) so
  the URL is shareable and back works. Limit fixed (20).

Status wording is one pure function so the badge and the sentence agree:

| Condition | Badge | Detail line |
| --- | --- | --- |
| `status === "inactive"` | destructive "Inactive" | (section replaced by `InactivePlanSection`) |
| `billing.subscriptionStatus === "past_due"` | destructive "Payment failed" | "Update your payment method on Polar to keep your plan." → portal |
| `billing.cancelAtPeriodEnd` | outline "Cancels on {endsAt ?? currentPeriodEnd}" | "You keep access until then. Resume from the Polar portal." |
| `trialing` | secondary "Trial" | "Trial ends {currentPeriodEnd}" |
| `active` | default "Active" | "Renews on {currentPeriodEnd}" |

`currentPeriodEnd` is labelled "Renews on" only when `cancelAtPeriodEnd` is
false, matching the backend's reason for not naming it `renewalDate`.

### 9. Invoice download: JSON `{ url }`, gesture-safe handoff

The backend plan offered `302` or `{ url }`. Choose **`{ url }`**: a plain
`<a href>` to a `302` endpoint cannot handle the `202` "generating" and `409`
"needs billing details" responses — it would open a tab showing raw JSON.

Flow on click: `downloadInvoice(orgId, orderId)` → `api<{ url }>()`:

- success → `window.open(url, "_blank", "noopener")`. To stay inside the
  user gesture, open the window **before** awaiting and set its `location`
  after; on failure close it. Wrap this in one helper so the popup dance
  lives in exactly one place.
- `202` → toast "Generating your invoice, try again in a few seconds"; the row
  shows a spinner for that click only.
- `409` → toast with the backend message + "Add billing details on Polar"
  action → portal.
- Presigned URLs are never stored in state or query cache.

Rows with `downloadable: false` still show the button (the `202` path
generates on demand); the label reads "Generate" instead of "Download".

### 10. `<PlanGate>` in `shared/components`

```tsx
<PlanGate feature="page-builder">            // renders children when has(feature)
	<PageBuilder />
</PlanGate>
<PlanGate feature="analytics-advanced" fallback={<BasicAnalytics />} />   // custom fallback
<PlanGate feature="custom-domain" mode="hide" />                          // nothing at all
```

- Reads `useEntitlements()`; imports only `@sinwy/shared` and `shared/*`, so
  it obeys the "shared never imports modules" rule and any module can use it.
- Default fallback is `UpgradePrompt`: feature name, "Available on
  {minimumPlanFor(feature)} and above", and a CTA. CTA depends on the viewer:
  `can("billing:manage")` → **Upgrade plan** (links to
  `/$organizationSlug/settings/billing` with `?change=plan` to open the
  dialog directly); otherwise "Ask an owner to upgrade."
- Inactive org: `featuresFor(null)` is `[]`, so the gate would say "upgrade"
  to someone who needs to *reactivate*. When `!isActive` the prompt says
  "Available once the organization has an active plan" and defers the CTA to
  the banner. One component, one branch, no duplicated copy.
- `minimumPlanFor(feature)`: first `PLAN_SLUGS` entry whose
  `PLAN_FEATURES` include it. Lives in `shared/lib/plans.ts` with a test
  pinned against the matrix. Relies on `PLAN_SLUGS` being ordered cheapest →
  priciest; assert that in the same test file so a reorder is caught.
- Gate on **features**, never on plan slugs. `plan === "professional"` in
  product code is the thing this component exists to prevent.

Route-level gating (`requireFeature` as a `beforeLoad`) is deliberately not
in scope: a redirect off a gated page is worse UX than rendering the prompt in
place, and no route needs it until Phase 8. If it becomes necessary, it
belongs in `protected-route.ts` next to `requirePermission`, and
`ORG_SECTIONS` gains an optional `feature`.

### 11. Plan names move to `shared/lib/plans.ts`

`getPlanName` currently lives in `PlanCards.tsx` (a module component).
`<PlanGate>`, the banner, the switcher and the billing badge all need the
display name, and `shared` cannot import `modules`. Move:

```ts
export const PLAN_NAMES: Record<PlanSlug, string> = { starter: "Starter", professional: "Business", enterprise: "Enterprise" };
export const getPlanName = (slug: PlanSlug) => PLAN_NAMES[slug];
export const minimumPlanFor = (feature: Feature): PlanSlug | null => …;
```

`PlanCards.tsx` keeps prices, bullets and icons (marketing copy) and reads
names from here. The `Record<PlanSlug, …>` shape means adding a plan without a
name is a compile error.

### 12. Formatting helpers are pure and tested

- `shared/lib/money.ts`: `formatMinorUnits(amount, currency, locale?)`. Use
  `Intl.NumberFormat`'s resolved `maximumFractionDigits` for the currency to
  scale (JPY has 0, most have 2); never `amount / 100` inline, never float
  arithmetic on amounts elsewhere.
- Dates: `Intl.DateTimeFormat(undefined, { dateStyle: "medium" })` over the
  ISO strings; no date library.
- `describeSubscription`, `minimumPlanFor`, `isAllowedWhileInactive`,
  `pollUntil` are all plain functions with `bun test` coverage. Components
  stay thin and untested (no DOM test runner in this workspace).

## Module boundaries

```
shared/lib/auth/auth-client.ts       + plan additionalField
shared/lib/auth/permissions.ts       + canAct, isActive
shared/lib/auth/entitlements.ts      useEntitlements
shared/lib/auth/read-only.ts         isAllowedWhileInactive
shared/lib/plans.ts                  PLAN_NAMES, getPlanName, minimumPlanFor
shared/lib/money.ts                  formatMinorUnits
shared/lib/poll-until.ts             pollUntil (moved from checkout; checkout keeps pollUntilActive as a thin wrapper or is updated)
shared/components/PlanGate.tsx
shared/components/SettingsSection.tsx   (lifted from account-dashboard)
shared/components/shell/AppShell.tsx    + banner slot

org-dashboard/routes/_shell.tsx                  entitlements in context, banner
org-dashboard/routes/_shell.settings.billing.tsx page + search schema
org-dashboard/components/InactiveOrganizationBanner.tsx
org-dashboard/components/billing/*
org-dashboard/lib/billing-queries.ts, subscription-status.ts, download-invoice.ts

organizations/components/PlanCards.tsx   reads PLAN_NAMES
organizations/routes/$id.plan.tsx        ?intent=renew copy
checkout/routes/success.tsx              dashboard when onboarding already complete
shell/OrganizationSwitcher.tsx           maps plan into OrganizationSummary (compile-forced), optional "Inactive" hint
```

Import direction stays `modules → shared`. `org-dashboard` may import
`organizations` (it already does for `FunnelProgress` elsewhere) but should
only need `shared/lib/plans.ts` after the move.

## Implementation order

Each step leaves `bun run verify` green. Steps 1–4 do not need the backend
endpoints and can start once `plan` exists in `@sinwy/shared`
`OrganizationDto` (backend step 1).

1. **Shared helpers** — `plans.ts` (move `getPlanName`, add
   `minimumPlanFor`), `money.ts`, `read-only.ts`, `poll-until.ts`; tests for
   each. Update `PlanCards.tsx` import.
2. **Context** — `auth-client.ts` `plan` field; `_shell.tsx` builds
   `entitlements`; `OrganizationSwitcher` maps `plan`; `useEntitlements`;
   `usePermissions` gains `canAct`/`isActive`. Extend
   `permissions-route.test.ts` style tests for the read-only rule.
3. **Banner** — `AppShell` slot, `InactiveOrganizationBanner`, wired in
   `OrganizationShell`. Verify by flipping `status` in the DB.
4. **`<PlanGate>`** — component + `UpgradePrompt` fallback, all three CTA
   branches. Drop a temporary gate on the Pages placeholder to eyeball it;
   remove before commit (nothing is gated yet).
5. **Billing page: read** — `billing-queries.ts`, `SettingsSection` lift,
   `CurrentPlanSection` / `InactivePlanSection`, `describeSubscription` +
   tests, portal button.
6. **Billing page: change plan** — dialog, mutation, invalidate + poll,
   `?change=plan` deep link used by `UpgradePrompt`.
7. **Invoices** — `InvoicesSection`, search-param pagination,
   `download-invoice.ts` with the `202` / `409` branches.
8. **Funnel touch-ups** — success page → dashboard when onboarding is
   complete; plan page `?intent=renew` copy.
9. **Docs** — `user-flow-map.md` §8 gains the plan-change and re-checkout
   arrows; roadmap "plans entitle nothing else yet" line is the backend's to
   update.

## Things to watch so this holds up as the app grows

- **Two stores, two jobs.** Route context = entitlement (what the app gates
  on). React Query `/subscription` = billing detail (what the owner pays). A
  component that needs to *gate* reads context; one that needs *money* reads
  the query. Never derive one from the other in a component.
- **Invalidate the router, not the world.** After plan change, re-checkout
  return, or a `409` "no active plan": `router.invalidate()` +
  `invalidateQueries(billingKeys.all(orgId))`. If someone adds
  `refetchInterval` to the subscription query "to be safe", every open billing
  tab becomes a Polar poller.
- **Gate on features, disable on `canAct`, hide on `can`.** Three verbs,
  three helpers. A `plan === "…"` comparison or a bare `status === "inactive"`
  outside `read-only.ts` / `entitlements.ts` is a review comment.
- **The UI gate is UX, the API is the law.** `<PlanGate>` and `canAct` reduce
  dead-end clicks; they do not protect anything. Every mutation still handles
  `402` (upgrade), `409` (reactivate) and `403` (not allowed) distinctly, by
  `code`, not by message text.
- **`auth-client.ts` mirrors the backend by hand.** There is no compile-time
  link between the two `additionalFields` blocks. When the backend adds a
  column, this file is the second place to touch; leave the comment there
  pointing at the backend file.
- **Catalogue ≠ Polar.** `PlanCards` prices and bullets are copy; Polar's
  `billing.amount` is truth. Show catalogue prices only where nothing better
  exists (the change-plan dialog, the funnel) and show Polar's on the current
  plan. When the two disagree in the sandbox, the catalogue is wrong.
- **Polar entry points are full-page redirects.** Checkout and the portal
  leave the app; never put them inside a form with unsaved state, and never
  assume the user comes back (the shell re-derives everything on entry).
- **Money is integer minor units; dates are ISO strings.** Format at the edge
  with `Intl`, never arithmetic in components. Zero-decimal currencies are the
  test case people forget.
- **Presigned URLs expire.** Fetch on click, hand off, forget. Nothing in
  React state, nothing in the query cache.
- **Route context is per-shell-load.** Someone can sit in the dashboard while
  the webhook revokes the org. The `409` handler closes that gap for writes;
  reads simply show slightly stale data until the next navigation, which is
  acceptable and cheaper than polling.
- **Keep `can` role-only.** The moment "inactive" leaks into `can`, the
  sidebar and the guards hide Team/Settings for a read-only org and the
  read-only promise breaks. `canAct` exists so that never has to happen.
- **`ssr: false` is inherited from the shell.** Billing components may touch
  `window`, but the helpers in `lib/` must not, or their tests stop running
  under `bun test`.
- **Accessibility of state.** Badges carry text, not only colour; the banner
  is `role="status"`; the dialog is the shared `Dialog` (focus trap, escape).

## Cross-cutting asks (to land in the backend half)

1. **Invoice download returns `{ url }` JSON**, not `302` (Decision 9 here;
   backend Decision 7 offered both). `202` and `409` stay as specified.
2. **`portal({ returnUrl: <WEB_APP_URL>/auth/postlogin })`** so Polar's portal
   has a way back. `/auth/postlogin` already resolves to the right dashboard
   for the session; the portal config is static, so a per-org return URL is
   not possible.
3. **`toPlanSlug` exported from `@sinwy/shared`** (backend step 3 mentions
   it); the shell's `beforeLoad` parses with it.
4. **`API_CODES.PLAN_UPGRADE_REQUIRED` in `@sinwy/shared`** so the frontend
   matches on the code, not the status.
5. **`OrganizationSummary.plan`** — the switcher's mapping is
   compile-forced, which is the intended tripwire.

## Open questions (decide before step 6)

1. **Change-plan surface** — dialog on the billing page (recommended, above)
   vs a sub-route `/settings/billing/plan` reusing `PlanCards`. The sub-route
   needs `billing.tsx` to become a layout and re-sells inside settings; the
   dialog is smaller and keeps `PlanCards` a funnel-only component.
2. **Downgrade copy** — depends on the backend's proration decision. If
   downgrades are deferred to period end, the dialog needs a second sentence
   and the badge a "Changes to {plan} on {date}" state (Polar's
   `pendingUpdate`), which the DTO does not carry yet.
3. **Banner for `past_due`** — the shell context only knows our `status`
   (still `active` while past due). A warning outside the billing page would
   need Polar's status in the shell, i.e. a request per shell load. Recommend
   no: the billing page shows it, and Polar emails the customer.
4. **Switcher hint** — show "Inactive" next to inactive organizations in the
   `OrganizationSwitcher`? Cheap once `plan`/`status` are mapped; purely a
   product call.
5. **Where invoices for a previous subscription go** — if the backend filters
   by the current `subscription_id`, an org that was revoked and re-purchased
   loses its earlier invoices from this list. The portal still has them; say
   so in the section's empty/footer copy if that is the chosen filter.

## Definition of done

- `bun run verify` exits 0.
- Tests cover: `isAllowedWhileInactive`, `canAct` composition,
  `minimumPlanFor` (+ `PLAN_SLUGS` ordering), `formatMinorUnits` (2-decimal
  and 0-decimal currency), `describeSubscription` (all five rows of the
  table), `pollUntil` (predicate, cancellation, exhaustion), `downloadInvoice`
  outcome mapping (`200`/`202`/`409`/other), and the nav ↔ sections pin still
  passes.
- Manual pass against the sandbox backend:
  - inactive org → banner on every shell page; owner sees **Choose a plan**,
    staff sees the ask-an-owner line; `canAct("bookings:write")` is false,
    `can("people:manage")` still true.
  - checkout from the banner → success → lands on the dashboard (onboarding
    complete) with the banner gone and the plan badge correct.
  - billing page: plan, price, "Renews on", Active badge; kill Polar creds →
    plan still shows, billing detail shows the unavailable note.
  - change plan → `202`, dialog closes, badge updates within the poll window;
    `<PlanGate>` on a temporarily gated page flips without reload.
  - cancel in portal → "Cancels on" badge; revoke → banner returns.
  - invoices list paginates; download opens a PDF; ungenerated invoice shows
    the generating toast then downloads on retry.
  - `<PlanGate>` shows the three CTA variants (owner, non-owner, inactive).
