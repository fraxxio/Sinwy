# Review: Phase 2 — Backend (issue #29)

Branch `29-roles-and-permission-scaffolding` vs `master`, backend commit
`944a699` plus the shared pieces it depends on (`73ad94d`). Reviewed against
Phase 2 of [roles-and-permissions-plan.md](../roles-and-permissions-plan.md).
Findings already raised in [phase-1-review.md](phase-1-review.md) are referenced,
not repeated; none of them have been addressed yet at the time of this review.

## Verdict

Phase 2 is implemented as specified. Every item in 2.1–2.6 is present, the
route-level gate works end to end, and the tests are honest: they run the real
`requireAuth`, real DB rows, real `auth.api.hasPermission`, and count `next()`
calls, so a middleware that always passed or short-circuited would fail.

Verified locally: `bun run test:server` (78 pass, 0 fail), `bun run typecheck`,
`bun run check` all green. Plan 2.7 grep for role literals matches only tests,
`memberHasRole("owner")` and the `reservedSlugs` list in `utils.ts`.

No blocking defects in the backend code itself. The one real bug affecting the
backend (`team` statement collision in the access controller) lives in the
shared package and is phase-1-review finding 1; it is still open and the
backend `orgAccessRoles` sanity test does not catch it. Below are the
Phase-2-specific points, ordered by how much they matter as more org-scoped
modules land.

## Findings

### 1. Plan-specified precedence "route param wins" has no test — test gap

[requirePermission.ts:29-31](../../Sinwy.Backend/modules/auth/requirePermission.ts#L29-L31),
[requirePermission.test.ts:118-133](../../Sinwy.Backend/modules/auth/tests/requirePermission.test.ts#L118-L133)

The decision table says "Route param `:organizationId` wins; fallback
`session.activeOrganizationId`". The code does that (`params.organizationId ??
activeOrganizationId`), but the only test touching `activeOrganizationId`
sets no param. There is no case where both are present and differ. This is
the exact scenario that matters for security (two dashboards open, request
targets org B while the session's active org is A): a future refactor that
flipped the precedence would still pass the suite.

Add one test: session active org = A (member as owner), param = B (member as
staff), `settings:manage` → 403, and `membershipFrom(ctx).organizationId === B`.

### 2. No HTTP-level test for a pure `admin` on the write endpoints — test gap

[organizations.test.ts:518-527](../../Sinwy.Backend/modules/organizations/tests/organizations.test.ts#L518-L527),
[organizations.test.ts:550-575](../../Sinwy.Backend/modules/organizations/tests/organizations.test.ts#L550-L575)

Before this change `canManage` allowed `owner` and `admin`. After it, the
HTTP tests exercise owner (via `createActiveOrg`) and staff (403) only. Admin
is covered at the middleware level, but only through the combined
`"staff,admin"` union case and the `billing:manage` denial. A regression that
dropped `settings:manage` from admin would surface as a middleware test
failure, not as a `PUT /profile` failure, and the union test could still pass
for the wrong reason. Add `joinAsAdmin` and assert 200 on `PUT profile` and
`POST onboarding/complete`; it is three lines with the new helpers.

### 3. Authorization now lives only at the route layer — design trade-off

[service.ts:88-95](../../Sinwy.Backend/modules/organizations/service.ts#L88-L95),
[controller.ts:88-97](../../Sinwy.Backend/modules/organizations/controller.ts#L88-L97)

`saveOrganizationProfile(organizationId, …)` and
`completeOrganizationOnboarding(organizationId)` no longer take a `userId` and
no longer verify membership. A route registered without
`requirePermission` is silently unprotected; the service will happily write.
The current controllers are safe because they take `organizationId` from
`membershipFrom(c)`, which throws (→ 500) if the middleware is missing. That
is the right pattern and it should be made a stated rule, since it is the only
thing that turns "forgot the middleware" into a loud failure instead of a
silent bypass:

> Write handlers on org-scoped routes must read `organizationId` from
> `membershipFrom(ctx)`, never from `ctx.req.params`.

Consider a lint-level guard later: a test that walks registered routes and
asserts every non-GET `/api/organizations/:organizationId/*` route has
`requirePermission` in its middleware list. Two things stand in the way
today, both small:

- `createApp` keeps `routes` in a closure
  ([lib/app/index.ts:55](../../Sinwy.Backend/lib/app/index.ts#L55)); add a
  `routes()` accessor on `IApp` so the test can enumerate them.
- `requirePermission(p)` returns a fresh anonymous closure, so identity or
  `fn.name` checks cannot recognise it. Tag it (e.g. a `Symbol` property set
  on the returned middleware) and have the test look for the tag.

Cheap now, harder once there are thirty routes.

Related: phase-1-review finding 5 (status check split from membership check,
two queries per write instead of one join) and finding 4 (implicit
`organizationId` param name). Both are Phase 2 code and both still stand.

### 4. Membership-only reads use a different mechanism than gated routes — tech debt

[service.ts:110-116](../../Sinwy.Backend/modules/organizations/service.ts#L110-L116),
[service.ts:48-57](../../Sinwy.Backend/modules/organizations/service.ts#L48-L57)

`GET status` and `GET onboarding` stay "any member may read" per the plan, but
they implement that inline in the service via repository joins
(`findStatusForMember`, `findMembership`), while gated routes declare
themselves in `routes.ts`. That is two conventions for the same concept. The
Overview page and every future "any member" endpoint (org header, member's own
profile, notifications) will copy the inline pattern.

Suggest a `requireMember` middleware in the auth module (same resolution and
404 semantics as `requirePermission`, no permission check, sets `membership`).
Then `requirePermission(p)` is `requireMember` plus one `hasPermission` call,
and the two read handlers can drop `userId` and the joins the same way the
write handlers did. `findMembership` becomes unused and can go (it already only
serves as an existence check; phase-1-review finding 7).

### 5. Data migration is never executed by the test suite — verify item

[0005_huge_loa.sql](../../Sinwy.Backend/drizzle/0005_huge_loa.sql),
[test/setup.ts:29-36](../../Sinwy.Backend/test/setup.ts#L29-L36)

Tests use `drizzle-kit push`, so the `UPDATE "member" SET "role" = 'admin'
WHERE "role" = 'member'` statement is never run under test. The plan (2.1.4)
asks for a manual `bun run db:migrate` to confirm it applies; I could not
verify from the branch that this was done. Two small notes on the statement
itself:

- Exact match only. A combined value such as `member,admin` would survive as a
  row that parses to `["admin"]` (fine) but the `member` fragment stays in the
  column forever. Better Auth never wrote combined roles for this app, so this
  is theoretical; `WHERE "role" LIKE '%member%'` with a `replace` would be
  the paranoid version, probably not worth it.
- The migration and the ALTER run in the same drizzle transaction, so a
  partial apply is not possible. Good.

### 6. `findMemberRole` relies on a uniqueness that the schema does not enforce — low

[auth/repository.ts:6-17](../../Sinwy.Backend/modules/auth/repository.ts#L6-L17),
[organizationSchema.ts:42-60](../../Sinwy.Backend/db/schema/organizationSchema.ts#L42-L60)

The query takes `[row]` from an unbounded select on `(userId, organizationId)`.
`member` has separate indexes on each column but no composite unique index.
Better Auth guards against duplicates in its own endpoints, but nothing stops
a direct insert (the test helper does exactly that) from creating two rows for
one user in one org, at which point the role checked depends on scan order.
A `unique("member_org_user_uq").on(organizationId, userId)` fixes the
invariant and gives this query (and `findStatusForMember`,
`findMembership`) a covering index. Low priority, but it is a one-line schema
change and one migration while the table is small.

### 7. `lib/` now depends on `modules/auth` for a second type — nit

[lib/sharedTypes.ts:1-6](../../Sinwy.Backend/lib/sharedTypes.ts#L1-L6)

`ReqContextValues` imports `Membership` from `@authModule`. It already
imported `auth` for the session type, so this follows the existing pattern,
and it is `import type` so there is no runtime cycle. Still, the framework
layer (`lib/app`) is now shaped by one module. If a third module wants to put
something on the context, the honest fix is to let `ReqContextValues` be an
interface that modules augment via declaration merging, or to move the
context-value types next to the framework and have modules import them.
Not urgent.

### 8. Small things

- [requirePermission.test.ts:49-51](../../Sinwy.Backend/modules/auth/tests/requirePermission.test.ts#L49-L51):
  `expect(() => requirePermission(...)(fakeCtx(), next)).toThrow()` on an
  `async` middleware. Bun's `toThrow` does inspect a returned rejected
  promise (verified), so the test is honest, but it reads as a sync assertion
  and would silently become vacuous under Jest/Vitest.
  `await expect(...).rejects.toThrow()` says what it means.
- [RolePermissions.ts:32-35](../../Sinwy.Shared/types/access/RolePermissions.ts#L32-L35):
  `ROLE_PERMISSIONS[role].includes(...)` throws `TypeError` if a non-`OrgRole`
  string reaches it through a type lie (e.g. roles taken from a request body
  in Phase 10). Today the only producer is `parseMemberRoles`, which filters,
  so this is defensive only. `ROLE_PERMISSIONS[role]?.includes(...) ?? false`
  keeps fail-closed semantics either way.
- [requirePermission.ts:37-42](../../Sinwy.Backend/modules/auth/requirePermission.ts#L37-L42):
  the warn fires on every request for an unrecognised role. Fine after the
  migration, but if Phase 10 lets `member` be set through Better Auth's
  endpoints (phase-1-review finding 3) it becomes a per-request log line for
  that user. Rate-limit or fix at the source when Phase 10 lands.
- The 403 message changed from "You don't have permission to change this
  organization" to the generic "You don't have permission to do that". No
  frontend code matches on the old string (checked), so this is safe.

## Plan conformance (Phase 2)

| Item | Status |
| --- | --- |
| 2.1 default `staff`, `0005` migration with `member → admin` UPDATE | Done. Manual `db:migrate` confirmation not verifiable from the branch (finding 5) |
| 2.2 `organization({ ac, roles: orgAccessRoles, … })`, `creatorRole` default | Done |
| 2.3 delete local `parseMemberRoles`, type `memberHasRole(OrgRole)`, keep `memberHasRole("owner")` in user repo | Done |
| 2.4 `requirePermission`, `membershipFrom`, `findMemberRole` in `auth/repository.ts`, `membership` on `ReqContextValues`, warn on unknown role | Done, matches the spec line for line |
| 2.5 `:id` → `:organizationId`, `settings:manage` on profile/complete, `denyInactive`, `forbidden` dropped, reads stay membership-only | Done. Controllers read org id from `membershipFrom` (finding 3) |
| 2.6 `permissions.test.ts` | All listed cases present. `orgAccessRoles` sanity test misses `team` (phase-1 finding 1) |
| 2.6 `requirePermission.test.ts` | All listed cases present, plus Better Auth integration. Missing "param wins over active org" (finding 1) |
| 2.6 `organizations.test.ts` `joinAsStaff` | Done. No admin case (finding 2) |
| 2.7 test / typecheck / check / grep | All green |

Architecture rules hold: the auth module owns its own `member` query rather
than reaching into organizations; organizations imports `requirePermission`
and `membershipFrom` through `@authModule`'s `index.ts`; no service contains a
role literal.

## Test honesty

Checked each new or changed test for whether it could pass against broken
code:

- `requirePermission.test.ts` composes the real `requireAuth` with a
  forged-but-correctly-signed cookie, so the session comes from the cookie
  exactly as in production. `nextCalls` is reset per run and asserted on both
  the allow and deny paths, so "always call next" and "never call next" both
  fail.
- Legacy `"member"` and combined `"staff,admin"` rows are inserted raw via
  `joinOrganization(…, role: string)`, so the parser is tested against real
  column values, not pre-parsed arrays.
- The Better Auth integration test asserts one positive and one negative
  `auth.api.hasPermission` for the same session, so it cannot pass if the
  plugin ignored `roles` (which would make both `false`) or if
  `allowCreatorAllPermissions`-style shortcuts made both `true`.
- `permissions.test.ts` pins each role's list as a literal rather than
  deriving the expectation from `PERMISSIONS`; the second `owner` assertion
  (`toEqual([...PERMISSIONS])`) is tautological given the implementation but
  harmless alongside the literal.
- `organizations.test.ts` keeps its HTTP-level 404/403/409 expectations
  unchanged through the refactor, which is the right way to prove the removed
  `forbidden` branch is now covered by the middleware.

Nothing is mocked that should not be. The one seam is `test/helpers.ts`
forging session cookies instead of signing up through Better Auth; that was
already the case on `master` and is justified there (Polar call on sign-up).

## Recommended order

1. Add the two missing tests (findings 1 and 2) — ten minutes, and they pin
   the two behaviours most likely to regress.
2. Fix the `team` collision from phase-1-review before any more code depends
   on `orgAccessRoles`.
3. Decide on `requireMember` (finding 4) and the "org id from
   `membershipFrom` only" rule (finding 3) before the bookings module starts,
   since that is the first module that will copy whatever pattern exists.
4. Composite unique index on `member` (finding 6) in the next migration you
   write anyway.
5. Nits (7, 8) whenever convenient.
