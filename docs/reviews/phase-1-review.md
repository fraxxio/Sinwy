# Review: roles & permission scaffolding (issue #29)

Branch `29-roles-and-permission-scaffolding` vs `master`, commits
`73ad94d` (shared), `944a699` (backend), `65b35d0` (web). Reviewed against
[roles-and-permissions-plan.md](../roles-and-permissions-plan.md). The plan's
"Phase 1" is only the shared package; since the ask covers tests and end-to-end
behaviour, this review covers everything implemented so far (plan phases 1–3).

## Verdict

Solid implementation that matches the plan closely, with one real defect in the
Better Auth access controller (`team` resource collision) and a handful of
design points worth settling before more org-scoped endpoints are added. Tests
are honest: they hit real code paths (real `requireAuth`, real DB rows, real
`auth.api.hasPermission`) and pin the matrix literally.

Verified locally: `bun run typecheck`, `bun run check`, `bun run test:server`
(78 pass), `bun run test:web` (69 pass), `bun run build:web` all green. Plan
2.7 / 3.8 greps for role literals match only tests, `memberHasRole("owner")`
and the `reservedSlugs` list.

## Findings

### 1. `team` collides with Better Auth's built-in `team` resource — bug

[accessControl.ts:18-21](../../Sinwy.Shared/types/access/accessControl.ts#L18-L21),
[Permission.ts:10](../../Sinwy.Shared/types/access/Permission.ts#L10)

Better Auth's `defaultStatements` already contains
`team: ["create", "update", "delete"]` (`better-auth/plugins/organization/access/statement`).
`{ ...defaultStatements, ...PERMISSION_STATEMENTS }` overwrites it with
`team: ["manage"]`, and `{ ...ownerAc.statements, ...toStatements(...) }` does
the same per role. Verified at runtime:

```
ac.statements.team = ["manage"]
owner  team: ["manage"]      ← was ["create","update","delete"]
owner.authorize({ team: ["create"] }) → unauthorized
```

The plan's stated intent ("built-in endpoints keep their default semantics per
role") is broken for teams. Nothing breaks today because `teams` is not enabled
on the plugin, but the moment it is, owners cannot create teams and the
`organizationClient` types will also reject `team: ["create"]`.

The test in
[permissions.test.ts:83-92](../../Sinwy.Backend/modules/auth/tests/permissions.test.ts#L83-L92)
is titled "keep better-auth's built-in rights" but only asserts `organization`
and `member`, so it did not catch this.

Fix: rename our resource so it cannot collide. Permission strings are never
persisted (only role names are), so this is a pure code change today and gets
expensive only once something stores them. Pick a name that is not adjacent
to a built-in either: `members:manage` would pass the guard below but sits
next to Better Auth's `member` resource, which is the same confusion one step
removed. `people:manage` or similar is safer.

Merging instead of overwriting (`team: [...defaultStatements.team, "manage"]`)
is not the one-line alternative it looks like: `PERMISSION_STATEMENTS` feeds
`ac`, but `toStatements` emits `team: ["manage"]` per role and overwrites
`ownerAc.statements.team` again at
[accessControl.ts:49-60](../../Sinwy.Shared/types/access/accessControl.ts#L49-L60),
so the merge would have to be repeated in each `newRole` call and couples the
matrix to Better Auth's list in four places. Not worth it.

Either way add a compile-time guard so this cannot recur:

```ts
type Overlap = Extract<keyof typeof defaultStatements, PermissionResource>;
const _noOverlap: Overlap extends never ? true : never = true;
```

and extend the sanity test to assert `owner.statements.team` still contains
`"create"` (or whatever the built-in list is after the rename).

### 2. Role-string parsing differs between our code and Better Auth — medium

[OrgRole.ts:13-17](../../Sinwy.Shared/types/access/OrgRole.ts#L13-L17)

`parseMemberRoles` trims whitespace (`"staff, admin"` → both roles);
`memberHasRole` strips spaces in SQL. Better Auth's `hasPermissionFn` does
`input.role.split(",")` with no trim, so the same row is `["staff", " admin"]`
there and `admin` is dropped. Result: our `requirePermission` grants
`settings:manage`, Better Auth's own endpoints (invite/remove/update role in
Phase 10) deny it for the same member.

Today nothing writes spaces, but the unit test explicitly blesses
`"owner, admin"`, which encodes the mismatch. Better Auth can also introduce
spaces itself: `createInvitation` stores the role string untrimmed
(`crud-invites.mjs:201`) and acceptance copies it into `member`; only
`updateMemberRole` normalises. So "normalise on write" cannot be done on our
side alone.

Recommend making our parser strict (no trim, so both readers agree and the
test pins `"owner,admin"`) and, in the same commit, dropping the
`replace(…, ' ', '')` from `memberHasRole` in
[memberRole.ts:7](../../Sinwy.Backend/db/memberRole.ts#L7) so the SQL and TS
parsers stay identical. Finding 3's `z.enum(ORG_ROLES)` on invite input is
what keeps every writer in agreement with both readers; the two belong
together.

### 3. Better Auth still accepts `member` as an invite role — future risk

`roles: orgAccessRoles` removes `member` from the *permission* map, but
`inviteMember` validates the requested role against
`defaultRoles ∪ options.roles` (`crud-invites.mjs`), so `member` remains a
valid invite/`updateMemberRole` value. Such a member fails closed (403 on
every gated endpoint, sidebar shows only Overview) and hits the `warn` log on
every request. Not exploitable, but Phase 10 must validate the role input with
`z.enum(ORG_ROLES)` before it reaches Better Auth (or use a plugin `before`
hook). Worth a line in the plan's Phase 10 notes now so it is not forgotten.

### 4. Org resolution relies on an implicit param name — design risk

[requirePermission.ts:29-32](../../Sinwy.Backend/modules/auth/requirePermission.ts#L29-L32)

`params["organizationId"]` is a naming convention. A future route declared as
`/api/bookings/:orgId/...` compiles fine, silently falls through to
`session.activeOrganizationId`, and checks the permission against a different
organization than the one in the URL. The current controllers avoid the
mismatch by reading `membershipFrom(c).organizationId` instead of the param,
which is the right habit — but nothing enforces it.

Suggestions:
- Export a single `ORGANIZATION_PARAM = "organizationId"` (or a path-building
  helper) from the auth module and use it in `routes.ts`, so the name lives in
  one place.
- Treat the `activeOrganizationId` fallback as a legacy path: with two
  dashboard tabs open on different orgs, the last `setActive` wins and a
  param-less write from the other tab lands in the wrong org. Prefer an
  explicit `:organizationId` on every org-scoped route going forward.

### 5. Organization status check is now split from the membership check — tech debt

[service.ts:88-95](../../Sinwy.Backend/modules/organizations/service.ts#L88-L95)

Before: `denyManage` resolved membership, role and paid status in one query.
Now: role in middleware (`findMemberRole`), status in the service
(`findStatus`). Every future write service must remember to call
`denyInactive` or unpaid orgs can be written to. Two options:
- Put `status` on `Membership` (one join in `findMemberRole`) so services check
  `membership.status` without a second query; or
- Add a `requireActiveOrganization` middleware and keep `denyInactive` only
  where a 409 message is needed.

Either is small now and avoids a class of omissions later. Related: this also
introduces a second query per write (`findMemberRole` + `findStatus`) where one
join did the job before.

### 6. Nav permission and route permission are declared twice — drift risk

[nav.tsx](../../Sinwy.WebFrontend/src/modules/org-dashboard/lib/nav.tsx),
`_shell.*.tsx`

Each section's permission appears in the sidebar item and again in the route's
`beforeLoad`. If they drift (nav says `bookings:read`, route says
`bookings:write`) the sidebar shows a link that bounces to Overview with an
error toast. Cheap guard: a test that walks `organizationNav("x")` and asserts
each item's `permission` equals the one the corresponding route file passes to
`requirePermission`; or put the permission in route `staticData` and have the
nav read it from there so there is one declaration.

### 7. Dead code left behind — nit

- [repository.ts:53-65](../../Sinwy.Backend/modules/organizations/repository.ts#L53-L65):
  `findMembership` still selects `role`, but its only caller
  (`getOrganizationOnboarding`) uses it as an existence check. It is now a
  duplicate of `findStatusForMember` minus the status. Collapse to one
  `isMember`-style query.
- `toOrgRole`, `permissionsOf`, `PERMISSION_RESOURCES`, `splitPermission`,
  `ORG_ROLES` are exported from `@sinwy/shared` but unused outside the access
  folder. `toOrgRole`/`permissionsOf` were in the plan; keep them only if
  Phase 10 has a concrete consumer, otherwise drop until needed.
- [accessControl.ts:27-37](../../Sinwy.Shared/types/access/accessControl.ts#L27-L37):
  `toStatements` hand-lists every resource. Typecheck catches an omission, but
  `Object.fromEntries(PERMISSION_RESOURCES.map((r) => [r, []]))` removes the
  second copy of the list.

### 8. `requireMember` swallows every error — nit

[protected-route.ts:42-51](../../Sinwy.WebFrontend/src/shared/lib/auth/protected-route.ts#L42-L51)

`.catch(() => null)` turns a network failure or a 500 into "not a member" and
redirects to `/` with no message. Acceptable for now; when the dashboard gets
an error surface, distinguish 403 from everything else.

## Plan conformance

| Plan item | Status |
| --- | --- |
| 1.1–1.4 shared types, matrix, access controller | Done; matrix matches the decision table exactly |
| 1.5 `better-auth` dep on shared | Done (`^1.6.11`) |
| 2.1 migration `member → admin`, default `staff` | Done, `0005_huge_loa.sql` has both statements |
| 2.2 plugin `ac` + `roles` | Done |
| 2.3 delete local `parseMemberRoles`, type `memberHasRole` | Done |
| 2.4 `requirePermission` / `membershipFrom` / `findMemberRole` | Done; warn log present |
| 2.5 rename `:id` → `:organizationId`, `denyInactive`, drop `forbidden` | Done; controllers read org id from `membershipFrom` (good) |
| 2.6 tests | Done, all listed cases present |
| 3.1–3.7 frontend | Done; deviations documented in the plan and are sensible (module-level flag for the toast, `fetchQuery`, `getActiveMemberRole`, `requireMember`) |
| Done criterion "no inline role check in feature pages/services" | Met; only `memberHasRole("owner")` (ownership semantics) remains |

Architecture rules hold: cross-module imports go through `index.ts`;
`shared/` does not import from `modules/`; `usePermissions` in `shared/` reads
route context generically rather than importing the org module.

## Test honesty

- Backend `requirePermission.test.ts` runs the real `requireAuth` with a
  forged-but-valid session cookie, real member rows (including legacy
  `"member"` and combined `"staff,admin"`), and asserts `next()` call counts,
  so a middleware that short-circuited or always passed would fail.
- The Better Auth integration test calls `auth.api.hasPermission` for a
  positive and a negative case, so it cannot pass if the plugin ignored our
  roles.
- `organizations.test.ts` keeps the 404/403/409 HTTP-level expectations after
  the refactor, so the removed `forbidden` branch is covered by the middleware.
- `permissions.test.ts` pins each role's list literally rather than deriving
  the expectation from the code under test.
- Frontend tests exercise the real guard and `isRedirect`; the toast is
  observed via the `takeAccessDenied` flag rather than mocked.

Gap: no assertion on `team` statements (finding 1), and no test that the nav
and route permissions agree (finding 6).

## Recommended order

1. Fix the `team` collision + add the overlap guard and test (finding 1).
2. Decide on parse strictness (finding 2) — five-minute change now, awkward
   after Phase 10 writes roles.
3. Note finding 3 in the plan's Phase 10 section.
4. Findings 4–6 are design choices for the next org-scoped module; settle them
   before bookings/services endpoints are written.
5. Nits (7–8) whenever convenient.
