# Review: Phase 3 — Frontend roles & permissions (issue #29)

Branch `29-roles-and-permission-scaffolding` vs `master`, commit `65b35d0`
(web) plus the shared code it consumes from `73ad94d`. Reviewed against
[roles-and-permissions-plan.md](../roles-and-permissions-plan.md) §3, with the
§3.9 deviations treated as the spec. Backend/shared findings already recorded
in [phase-1-review.md](phase-1-review.md) are referenced, not repeated.

## Verdict

Phase 3 is implemented as planned and the deviations are justified — each one
was checked against the installed libraries (see "Verified behaviour" below).
Gating works in both directions: the sidebar hides what the member cannot open
and the route guard bounces them if they type the URL. Tests are honest. What
remains is one small cross-user caching bug, one consistency gap in the billing
funnel, and a few design choices worth tightening before the next module
(bookings) starts stacking on this foundation.

Verified locally: `bun run typecheck`, `bun run check`, `bun run test:web`
(69 pass). Plan §3.8 grep for role literals matches nothing outside tests.

## Findings

### 1. Member roles are cached per organization, not per user, and sign-out does not clear the cache — bug (low)

[permissions.ts:19](../../Sinwy.WebFrontend/src/shared/lib/auth/permissions.ts#L19),
[Header.tsx:179-183](../../Sinwy.WebFrontend/src/shared/components/Header.tsx#L179-L183),
[NavUser.tsx:121-122](../../Sinwy.WebFrontend/src/shared/components/shell/NavUser.tsx#L121-L122)

`memberAccessQuery` is keyed `["organizations", orgId, "member"]` with a 60 s
`staleTime`. Both sign-out paths call `authClient.signOut()` and then
`navigate({ to: "/" })` — an in-app navigation, so the `QueryClient` created in
`root-provider.tsx` survives. Sequence on one tab: owner signs out, staff member
of the same org signs in within 60 s, opens the org → `requireMember` returns
the owner's cached roles. The sidebar shows every section and the route guards
let them through; the backend still returns 403 on writes, so this is a UX
defect, not a security hole. `postLoginFlags` has the same shape of problem
(pre-existing).

Fix: one `signOut()` helper in `shared/lib/auth/` that does
`await authClient.signOut(); queryClient.clear();` and is used by both menus
(they are already duplicated). Keying on `session.user.id` also works but leaves
stale entries around.

### 2. The billing funnel is membership-gated, not `billing:manage` — consistency gap (low today, must-fix before invitations)

[$id.plan.tsx:33-46](../../Sinwy.WebFrontend/src/modules/organizations/routes/$id.plan.tsx#L33-L46),
[checkoutGuard.ts:8-21](../../Sinwy.Backend/modules/auth/checkoutGuard.ts#L8-L21)

The plan gates the onboarding route with `settings:manage` (done) but says
nothing about `/organizations/$id/plan`, and `ensureCheckoutAllowed` on the
backend checks membership and status only. The decision table says buying is
`billing:manage` (owner only). Today only the creator can reach an inactive
org, so nothing is exposed; the moment Phase 10 lets an admin or staff member
into an org that lapsed, they can buy a subscription for it.

Recommend fixing both sides now, while they are still small:

- Backend: `ensureCheckoutAllowed` is a Better Auth `before` hook, not a
  route, so it cannot use `requirePermission`. Call `findMemberRole` (same
  module) and check `hasPermission(parseMemberRoles(role), "billing:manage")`
  next to the existing status check. If phase-2 finding 4 lands and
  `getOrganizationStatus` drops its `userId` argument, this hook is the one
  caller that still needs its own membership lookup — do the two changes
  together.
- Frontend: the shared `requirePermission` redirects to `/$organizationSlug`
  and the plan route only has `params.id`, so `requireMember` +
  `requirePermission` is not enough on its own. Either resolve the org first
  the way
  [$id.onboarding.tsx:42-44](../../Sinwy.WebFrontend/src/modules/organizations/routes/$id.onboarding.tsx#L42-L44)
  does (`setActive({ organizationId: params.id })` returns the slug), or do a
  bespoke `hasPermission(member.roles, "billing:manage")` and redirect to
  `/`. The first reuses the one guard; the second avoids adding a session side
  effect to the funnel route.

At minimum add it to the plan's Phase 10 notes next to phase-1 finding 3.

### 3. `usePermissions` silently returns "no access" when rendered outside the shell match — design caveat

[permissions.ts:37-40](../../Sinwy.WebFrontend/src/shared/lib/auth/permissions.ts#L37-L40)

`useRouteContext({ strict: false })` resolves to the *nearest* route match
(verified: it is `useMatch` with the match id from React context). That is the
`_shell` match for the sidebar, so it works. But anything rendered outside that
match — a command palette in `root.tsx`, a dialog portalled from the Header, a
notification drawer — calls `can()` and gets `false` with no error. Failing
closed is the right direction, but the failure is invisible and will cost
someone an afternoon once `can()` starts gating buttons inside features.

Cheap hardening: read from all matches instead of the nearest one:

```ts
const roles = useMatches({
	select: (matches) =>
		matches.find((m) => "member" in m.context)?.context.member?.roles ?? NO_ROLES,
});
```

Now any component anywhere on an org page sees the roles. Keep the current
outside-the-org behaviour (empty roles) as documented.

### 4. Access-denied notice is a module-level flag polled on router status — works, but fragile

[access-denied.ts](../../Sinwy.WebFrontend/src/shared/lib/auth/access-denied.ts),
[AccessDeniedToast.tsx:10-20](../../Sinwy.WebFrontend/src/shared/components/AccessDeniedToast.tsx#L10-L20),
[root.tsx:86-89](../../Sinwy.WebFrontend/src/root.tsx#L86-L89)

The deviation is justified: base-ui's `createToastManager` drops `add()` calls
with no listeners, and `Toast.Provider` subscribes in a passive `useEffect`, so
firing the toast from `beforeLoad` on a hard load really would lose it. The
current mechanism also holds up: the router sets `status` to `pending` before
running `beforeLoad` and to `idle` after the redirect target commits, so the
effect re-fires after every denial, and rendering `AccessDeniedToast` as a later
sibling of `<Toaster>` guarantees the provider's effect has run first.

What makes it debt:

- It relies on an implicit invariant (status must flip on every denial). A
  future `beforeLoad` that denies without a router transition — or a router
  upgrade that batches `pending → idle` into one render — leaves the flag
  set until the *next* navigation, where a stale toast surprises the user.
- `UnfinishedOnboardingToast` sits *inside* `<Toaster>` (its effect runs
  before the provider subscribes; it only works because it waits on async
  query data), `AccessDeniedToast` sits *outside*. Two toasts, two placements,
  one comment explaining the difference. The next person will copy the wrong
  one.
- The guard is only ever reached under `ssr: false` today. If it is ever
  attached to an SSR'd route, `pending` is set in the server process and never
  consumed — harmless, but nobody will know why the client sees no toast.

Suggested shape: replace the boolean with a tiny deferred-toast queue in
`shared/components/ui/` — `enqueueToast(options)` pushes when there is no
subscriber and flushes from the provider's mount effect. Then any `beforeLoad`
(denied, org inactive, session expired) can toast without knowing about router
timing, both existing toasts move to it, and the `status` subscription goes
away. Not urgent; do it before the third `beforeLoad` toast appears.

### 5. Nav and route permissions are declared twice with nothing tying them together — drift risk

[nav.tsx:29-83](../../Sinwy.WebFrontend/src/modules/org-dashboard/lib/nav.tsx#L29-L83),
`_shell.*.tsx`

Same as phase-1 finding 6, restated here because Phase 3 is where it lives.
Ten permissions appear in `nav.tsx` and ten more in the route files; the
compiler checks that each is a valid `Permission`, not that they match. When
they drift, the sidebar shows a link that bounces to Overview with an error
toast — exactly the symptom this ticket set out to prevent.

Preferred fix is a single declaration: an `ORG_SECTIONS` table in
`modules/org-dashboard/lib/` mapping section → `{ to, permission }`, consumed by
both `organizationNav()` and each route's
`beforeLoad: requirePermission(ORG_SECTIONS.team.permission)`. Route files
importing from their own module's `lib/` is fine under the module rules.

If the double declaration stays, add a pure test: import every
`_shell.*.tsx` route, call `Route.options.beforeLoad` with an owner/admin/staff
context, and assert allow/deny matches `hasPermission(roles, item.permission)`
for the nav item whose `link.to` equals `Route.fullPath`. It runs in bun with
no DOM.

### 6. `setActive` runs on every navigation and on hover preloads; `requireMember` builds on it — interplay risk

[_shell.tsx:14-22](../../Sinwy.WebFrontend/src/modules/org-dashboard/routes/_shell.tsx#L14-L22)

Pre-existing: `_shell.beforeLoad` POSTs `setActive` on every navigation under
the dashboard, including intent preloads. New in this phase: the organization
switcher links to other orgs, so hovering one now `setActive`s it server-side
*and* fetches that org's member role, without the user going anywhere. Combined
with the backend's `activeOrganizationId` fallback (phase-1 finding 4), a
param-less API call from the page the user is actually on is then authorised
against the hovered org.

Mitigation now: skip `setActive` on preload, but the shell must still return
`organization` and `member` — every child `requirePermission` reads
`context.member.roles`
([protected-route.ts:106](../../Sinwy.WebFrontend/src/shared/lib/auth/protected-route.ts#L106)),
so a bare `if (preload) return` would turn each hover preload into a
`TypeError` instead of a silent redirect. Both lookups have non-mutating
forms in better-auth 1.6.23 (verified in `crud-org.mjs` and
`crud-members.mjs`): `getFullOrganization({ query: { organizationSlug,
membersLimit: 1 } })` resolves the slug, checks membership and returns the
organization row (`membersLimit: 0` is falsy and returns every member), and
`getActiveMemberRole({ query: { organizationSlug } })` returns the caller's
role without touching the session. Shape:

```ts
const { data, error } = preload
	? await authClient.organization.getFullOrganization({
			query: { organizationSlug: params.organizationSlug, membersLimit: 1 },
		})
	: await authClient.organization.setActive({
			organizationSlug: params.organizationSlug,
		});
```

`requireMember` then runs unchanged on `data.id`; the destination's own
non-preload load still calls `setActive`. Longer term, one backend "org
bootstrap" endpoint returning organization + membership + status in a single
round trip replaces `setActive` + `getActiveMemberRole` + `status`, and makes
the backend fallback unnecessary.

### 7. Small things

- [protected-route.ts:47-48](../../Sinwy.WebFrontend/src/shared/lib/auth/protected-route.ts#L47-L48):
  `.catch(() => null)` treats a network failure as "not a member" and redirects
  to `/` with no message (phase-1 nit 8). `fetchQuery` defaults `retry` to
  `false` (verified), so at least it fails fast.
- [permissions-route.test.ts:44](../../Sinwy.WebFrontend/src/shared/tests/permissions-route.test.ts#L44)
  and [:48](../../Sinwy.WebFrontend/src/shared/tests/permissions-route.test.ts#L48)
  assert `toThrow()` only; tighten to `isRedirect` so a thrown `TypeError` from
  a refactor cannot pass as a denial.
- `AccessDeniedToast.tsx` is an auth concern living at the top of
  `shared/components/`; if finding 4 is not picked up, move it next to
  `access-denied.ts` or under `shared/components/auth/`.
- `OrgRouteContext.organization` is typed `{ slug: string }` but the shell
  puts the full Better Auth organization in context. Fine for now; when a
  feature needs `organization.id` from `usePermissions`-style hooks, widen the
  type in one place rather than casting.

## Plan conformance (§3)

| Plan item | Status |
| --- | --- |
| 3.1 `ac` + `roles` on `organizationClient` | Done |
| 3.2 `memberAccessQuery`, member in shell context | Done — `fetchQuery` (correct: `ensureQueryData` would never refetch a cached row, so a DB role change would only show up after the 5 min gc); `getActiveMemberRole({ query: { organizationId } })` exists in better-auth 1.6.23, returns the caller's role for that org |
| 3.3 `requirePermission` guard, redirect to Overview, non-stacking toast | Done — fixed id verified to update-in-place in base-ui; redirect uses `replace: true` (verified in router-core), so Back does not re-enter the denied URL |
| 3.3 silent on preload | Done — verified preloads follow a thrown redirect as a preload, never a navigation |
| 3.4 `usePermissions()` | Done; see finding 3 |
| 3.5 nav permissions + `filterNav` | Done, matches the table exactly; account sidebar unaffected |
| 3.6 route `beforeLoad`s | Done on all nine layout routes and `settings/billing`; index/`$id` children add nothing |
| 3.6 onboarding route | Done via `requireMember` + `requirePermission("settings:manage")` with a hand-built context |
| 3.7 tests | Done; see below |
| 3.8 verify | Green |
| Done criterion (sidebar + redirect change with DB role) | Met by construction; Phase 4 hand check still owed |

Architecture rules hold: `shared/` imports nothing from `modules/`; the only
module-path knowledge in `shared/` is the redirect target `/$organizationSlug`,
which mirrors `requireAuth`'s `/auth/login`. `nav-filter.ts` ↔ `SidebarNav.tsx`
is a type-only cycle, erased at build.

## Test honesty

- `nav-filter.test.ts` exercises the real `filterNav` with literal fixtures
  and literal expected titles. Each branch (unpermissioned kept, gated dropped,
  group with subset, group hidden) has its own case; dropping sub-item
  filtering or the empty-group rule fails a test.
- `permissions-route.test.ts` runs the real guard, checks the thrown value with
  the router's own `isRedirect`, pins `to`/`params`, and observes the notice via
  `takeAccessDenied()` on the real module rather than a mock. The preload case
  proves silence, and `beforeEach` resets the flag so tests cannot leak into
  each other.
- No `mock.module`, no snapshot of the code under test, no expectation derived
  from the implementation.

Not covered (needs a router/DOM harness, acceptable for now): `requireMember`
redirect on failure, `memberAccessQuery` → `parseMemberRoles` wiring,
`usePermissions` outside the shell, `AccessDeniedToast` timing. The one gap
that is pure and cheap is the nav↔route agreement test in finding 5.

## Verified behaviour (so nobody has to re-derive it)

- base-ui `createToastManager.add()` emits to a listener set; with none
  subscribed the toast is dropped. `Toast.Provider` subscribes in `useEffect`.
- Adding a toast with an existing `id` updates it and resets its timer.
- router-core 1.171: `status` is set to `pending` before matches load and to
  `idle` after commit; a redirect thrown in `beforeLoad` is followed with
  `replace: true`; during preload a redirect is preloaded, not navigated.
- `useRouteContext({ strict: false })` = nearest match's context.
- `QueryClient.fetchQuery` forces `retry: false` unless set, and honours
  `staleTime`.
- `setActive` returns only the organization row (no members), so the second
  request for the role is necessary with the current API surface.

## Recommended order

1. Finding 1 — single `signOut()` helper with `queryClient.clear()`.
2. Finding 2 — gate the plan route and checkout hook, or record it in Phase 10.
3. Finding 5 — collapse to one `ORG_SECTIONS` declaration before the bookings
   module adds more routes.
4. Finding 6 — skip `setActive` on preload, keeping `organization` and
   `member` in context via the non-mutating lookups.
5. Findings 3 and 4 — before `can()` starts gating in-page UI and before a
   third `beforeLoad` toast is needed, respectively.
6. Nits whenever convenient.
