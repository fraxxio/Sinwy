# Technical Plan — Frontend: Organization Creation, Payments, Onboarding

Implements the frontend half of [user-creation-roadmap.md](./user-creation-roadmap.md) (flow map 4–6). The previous backend plan is fully implemented and removed from this doc.

**Already in place:**

- Backend: email/password + verification, Google OAuth, organization plugin (`status`, client-side creation disabled), Polar plugin with checkout slugs `starter` / `professional` / `enterprise`, webhook projection subscription → `organization.status`, `POST /api/organizations`, `GET /api/organizations/:id/status` (both session-guarded), `successUrl: /checkout/success?checkout_id={CHECKOUT_ID}`.
- Frontend: login/register pages, `FormInput`, virtual-file route modules (`home`, `auth`).

**Phase order note:** payments cannot come first — checkout requires an existing organization id as `referenceId` (roadmap §7.1, "Organization First, Then Billing"). So: entry routing → create org → pay → onboard.

---

## Phase 1 — Auth Client Plugins & Business-Owner Entry

Goal: the client can talk to the org/Polar endpoints, and business-owner signups land in the org creation flow.

1. `bun add @polar-sh/better-auth` in the frontend workspace; add `organizationClient()` and `polarClient()` to [auth-client.ts](../Sinwy.WebFrontend/src/modules/auth/lib/auth-client.ts).
2. Backend: set `emailVerification.autoSignInAfterVerification: true` — without it the verification link lands the business signup on `/organizations/new` with no session, the guard bounces them to login, and login's hardcoded `navigate({ to: "/" })` loses the flow. Update the register page's "verify, then sign in" copy to match.
3. Business marketing CTA links to `/auth/register?source=business`. Register (and Google button) pass `callbackURL: "/organizations/new"` when `source=business`, else `"/"`. The source lives only in the URL/callback — never persisted (roadmap §1.4).

Done when: a verified business signup lands on `/organizations/new` signed in; a normal signup lands on `/`.

---

## Phase 2 — First Organization Creation

Goal: business owner names their organization; it exists as `inactive`.

1. New frontend module `modules/organizations`; add `physical("/organizations", "modules/organizations/routes")` to [routes.ts](../Sinwy.WebFrontend/src/routes.ts).
2. `new.tsx`: session guard in `beforeLoad` (no session → redirect to login). Single `FormInput` (name) → `POST /api/organizations` → response `{ id, name, slug, status }`.
3. On success navigate to `/organizations/$id/plan`.

Done when: submitting the form creates an `inactive` org (creator = owner) and lands on the plan page.

---

## Phase 3 — Payments

Goal: pick a plan, pay via Polar, organization activates.

1. `$id.plan.tsx`: three plan cards; slugs must match the backend checkout config (`starter`, `professional`, `enterprise`). Selecting one stores the org id in `sessionStorage` (the static `successUrl` can't carry it) and calls `authClient.checkout({ slug, referenceId: orgId })` → browser goes to Polar.
2. `/checkout/success` route (small `checkout` module or a route in `organizations`): the Polar plugin resolves the relative `successUrl` against the backend request URL, so this only reaches the frontend because dev proxies `/api` same-origin — **prod must keep frontend and backend on one origin** (reverse proxy `/api` → backend). Reads org id from `sessionStorage`; missing → fallback link to dashboard. Shows "Activating your organization…" and polls `GET /api/organizations/:id/status` every ~2s until `active`; ~60s timeout → "taking longer than expected" message with a retry link (webhook is async, roadmap Step 6).
3. On `active`: navigate to `/organizations/$id/onboarding`.

Extract the polling loop as a pure function (injected fetch + timers) with one unit test: resolves on `active`, survives one failed request, gives up on timeout.

Done when: a Polar sandbox payment flips the org to `active` and the browser ends up on the onboarding route.

---

## Phase 4 — Onboarding Entry

Goal: activated business owners enter Organization Mode and start onboarding.

1. On entering onboarding, call `authClient.organization.setActive({ organizationId })` — Organization Mode is just "an active org is set" (roadmap §6).
2. `$id.onboarding.tsx`: wizard shell only — welcome step + "set up your page" placeholder. The real page-builder wizard is a later pass; no "onboarding completed" flag yet — add it to the org when the wizard has real steps to complete.
3. Post-login routing: pure function `(session, organizations, activeOrgId) → destination` — active/last org → `/organizations/$id/onboarding` (stand-in until a dashboard route exists), no orgs → `/` (Customer Mode). One unit test over the branches.
4. Wire it via a tiny `/postlogin` dispatcher route (`beforeLoad`: run the function, redirect). Email login navigates there after `signIn.email`; Google buttons use `callbackURL: "/postlogin"` — OAuth redirects can't run the function client-side, so both paths converge on the route.

Done when: login as an owner of an active org lands in Organization Mode; a user with no orgs lands in Customer Mode; fresh activation flows straight into the wizard shell.

---

## Bound by (from the roadmap)

- Org creation only via `POST /api/organizations`; orgs are `inactive` until Polar says otherwise.
- No local subscription state on the frontend either — poll org `status`, nothing else.
- Registration source is transient (`callbackURL` only).
- Mode = active organization context; every user can always switch back to Customer Mode.
