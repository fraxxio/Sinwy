# Roles & Permission Scaffolding — Implementation Plan (issue #29)

Goal: every page and endpoint declares what it needs. Gating is real from this
ticket on; since every existing member is `owner` or `admin`, nothing changes
visibly until invitations ship and the first `staff` members appear.

Done when: flipping a member's role in the DB visibly changes the sidebar and
redirects them off pages they cannot use, and no feature page or service
contains an inline role check.

## Decisions (already made, do not re-open)

| Topic | Decision |
| --- | --- |
| Roles | `owner`, `admin`, `staff`. No `member`. |
| Permissions | Every resource has `:read` and (where writable now) `:write`; management surfaces are `:manage`. Nothing is implied by membership except the Overview page. |
| Matrix | owner: everything. admin: everything except `billing:manage`. staff: `bookings:read/write`, `customers:read/write`, `services:read`, `pages:read`. |
| Legacy `member` rows | One-off SQL migration to `admin`; column default becomes `staff`. Unknown roles fail closed (no permissions). |
| Backend org resolution | Route param `:organizationId` wins; fallback `session.activeOrganizationId`; neither → 400. Non-member → 404, member without permission → 403. |
| Access controller | Built once in `@sinwy/shared` from `ROLE_PERMISSIONS`; both Better Auth plugin configs import it. Shared adds `better-auth` as a dependency. |
| Overview page | Membership only, no permission. It is the denial redirect target so it can never loop. |
| Existing `denyManage` | Replaced by `requirePermission("settings:manage")` on the route; the org‑inactive 409 check stays in the service. |
| Role changes | Take effect on the next shell load (reload or navigation after the cache expires). No live push. |

Deviation from the ticket wording: the Better Auth session carries only
`activeOrganizationId`, not the role. The frontend reads the role from the org
shell's route context, sourced from `authClient.organization.getActiveMember()`.

## Existing code you will touch

- Shared: [Sinwy.Shared/types/index.ts](../Sinwy.Shared/types/index.ts), [Sinwy.Shared/package.json](../Sinwy.Shared/package.json)
- Backend: [modules/auth/auth.ts](../Sinwy.Backend/modules/auth/auth.ts), [modules/auth/middleware.ts](../Sinwy.Backend/modules/auth/middleware.ts), [modules/auth/index.ts](../Sinwy.Backend/modules/auth/index.ts), [lib/sharedTypes.ts](../Sinwy.Backend/lib/sharedTypes.ts), [db/memberRole.ts](../Sinwy.Backend/db/memberRole.ts), [db/schema/organizationSchema.ts](../Sinwy.Backend/db/schema/organizationSchema.ts), [modules/organizations/service.ts](../Sinwy.Backend/modules/organizations/service.ts), [modules/organizations/controller.ts](../Sinwy.Backend/modules/organizations/controller.ts), [modules/organizations/routes.ts](../Sinwy.Backend/modules/organizations/routes.ts), [modules/organizations/tests/organizations.test.ts](../Sinwy.Backend/modules/organizations/tests/organizations.test.ts), [modules/user/repository.ts](../Sinwy.Backend/modules/user/repository.ts)
- Frontend: [shared/lib/auth/auth-client.ts](../Sinwy.WebFrontend/src/shared/lib/auth/auth-client.ts), [shared/lib/auth/protected-route.ts](../Sinwy.WebFrontend/src/shared/lib/auth/protected-route.ts), [shared/components/shell/SidebarNav.tsx](../Sinwy.WebFrontend/src/shared/components/shell/SidebarNav.tsx), [modules/org-dashboard/lib/nav.tsx](../Sinwy.WebFrontend/src/modules/org-dashboard/lib/nav.tsx), [modules/org-dashboard/routes/_shell.tsx](../Sinwy.WebFrontend/src/modules/org-dashboard/routes/_shell.tsx), every `modules/org-dashboard/routes/_shell.*.tsx`, [modules/organizations/routes/$id.onboarding.tsx](../Sinwy.WebFrontend/src/modules/organizations/routes/$id.onboarding.tsx)

Rules that apply throughout (from CLAUDE.md): Bun only, Biome formatting
(tabs, double quotes), Zod for validation, plain functions, cross-module
imports only through a module's `index.ts`, `shared/` never imports from
`modules/`, no session-specific comments.

---

## Phase 1 — Shared: roles, permissions, access controller

New folder `Sinwy.Shared/types/access/`, re-exported from `types/index.ts`.

### 1.1 `OrgRole.ts`

```ts
export const ORG_ROLES = ["owner", "admin", "staff"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** null for anything not in ORG_ROLES, callers treat that as no access */
export function toOrgRole(value: string): OrgRole | null;

/** better-auth stores several roles in one comma separated column; unknown names are dropped */
export function parseMemberRoles(role: string): OrgRole[];
```

### 1.2 `Permission.ts`

Define the statement object once; the permission list and type derive from it.
The object shape is exactly what Better Auth's `createAccessControl` takes.

```ts
export const PERMISSION_STATEMENTS = {
	bookings: ["read", "write"],
	services: ["read", "write"],
	customers: ["read", "write"],
	pages: ["read", "write"],
	payments: ["read"],
	analytics: ["read"],
	team: ["manage"],
	billing: ["manage"],
	settings: ["manage"],
} as const;

export type Permission = {
	[R in keyof typeof PERMISSION_STATEMENTS]: `${R}:${(typeof PERMISSION_STATEMENTS)[R][number]}`;
}[keyof typeof PERMISSION_STATEMENTS];

export const PERMISSIONS: readonly Permission[]; // flattened, stable order
```

### 1.3 `RolePermissions.ts`

Literal lists, not filters, so the matrix is readable and the test can pin it.

```ts
export const ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
	owner: [...PERMISSIONS],
	admin: [ /* all except "billing:manage", written out */ ],
	staff: ["bookings:read", "bookings:write", "customers:read", "customers:write", "services:read", "pages:read"],
};

/** union over all held roles; empty roles → false */
export function hasPermission(roles: readonly OrgRole[], permission: Permission): boolean;
export function permissionsOf(roles: readonly OrgRole[]): Set<Permission>;
```

### 1.4 `accessControl.ts`

```ts
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, memberAc, ownerAc } from "better-auth/plugins/organization/access";

export const ac = createAccessControl({ ...defaultStatements, ...PERMISSION_STATEMENTS });

// toStatements("bookings:read", "bookings:write") → { bookings: ["read", "write"] }
export const orgAccessRoles = {
	owner: ac.newRole({ ...ownerAc.statements, ...toStatements(ROLE_PERMISSIONS.owner) }),
	admin: ac.newRole({ ...adminAc.statements, ...toStatements(ROLE_PERMISSIONS.admin) }),
	staff: ac.newRole({ ...memberAc.statements, ...toStatements(ROLE_PERMISSIONS.staff) }),
} satisfies Record<OrgRole, unknown>;
```

Keeping `defaultStatements` and the built-in `ownerAc`/`adminAc`/`memberAc`
statements means Better Auth's own endpoints (invite, update role, remove
member, delete org) keep their default semantics per role. `staff` inherits
`memberAc` (no organization/member/invitation rights).

### 1.5 Package

Add `"better-auth": "^1.6.11"` to `Sinwy.Shared/package.json` dependencies
(same range as the root). Run `bun install`.

### 1.6 Verify

`bun run typecheck` passes. No tests here; the matrix tests live in the backend
(next phase) per the ticket.

---

## Phase 2 — Backend

### 2.1 Migration: legacy `member` → `admin`, default → `staff`

1. In `db/schema/organizationSchema.ts` change `member.role` default from
   `"member"` to `"staff"`.
2. `bun run db:generate` → produces `drizzle/0005_*.sql` with the ALTER.
3. Append to that same file:
   ```sql
   --> statement-breakpoint
   UPDATE "member" SET "role" = 'admin' WHERE "role" = 'member';
   ```
4. `bun run db:migrate` locally to confirm it applies. Tests use
   `drizzle-kit push`, which never runs data migrations; that is fine because
   tests insert explicit roles.

### 2.2 Better Auth config

In `modules/auth/auth.ts`:

```ts
organization({
	ac,
	roles: orgAccessRoles,
	allowUserToCreateOrganization: false,
	schema: { ... unchanged ... },
})
```

`creatorRole` stays at its default (`owner`).

### 2.3 Role helpers

- Delete `parseMemberRoles` from `db/memberRole.ts`; import the shared one
  everywhere. Keep `memberHasRole` (SQL) but type its argument as `OrgRole`.
- `modules/user/repository.ts` keeps `memberHasRole("owner")`: that is
  ownership/billing semantics, not a permission check, and is unchanged.

### 2.4 `requirePermission` middleware

New file `modules/auth/requirePermission.ts`, exported from `modules/auth/index.ts`
together with `membershipFrom`.

```ts
export type Membership = {
	organizationId: string;
	roles: OrgRole[];
};

export const requirePermission = (permission: Permission): Middleware =>
	async (ctx, next) => {
		const session = sessionFrom(ctx); // throws if requireAuth did not run
		const params = ctx.req.params as Record<string, string | undefined>;
		const organizationId = params["organizationId"] ?? session.session.activeOrganizationId;
		if (!organizationId) return fail("No organization in scope", 400);

		const role = await findMemberRole(session.user.id, organizationId); // null → not a member
		if (role === null) return fail("Not found", 404);

		const roles = parseMemberRoles(role);
		if (!hasPermission(roles, permission)) return fail("You don't have permission to do that", 403);

		ctx.set("membership", { organizationId, roles });
		return next();
	};

export const membershipFrom = (ctx: IReqContext): Membership; // throws if the middleware did not run
```

- `findMemberRole` lives in a new `modules/auth/repository.ts` (single select
  on `member` by userId + organizationId). The `member` table is Better Auth's
  and lives under `@db`, so the auth module may query it with its own
  repository; the organizations module must not be reached for this.
- Add `membership: Membership` to `ReqContextValues` in `lib/sharedTypes.ts`.
- Unknown role strings (e.g. a stray `member`) parse to `[]` and therefore 403.
  Log a `warn` once per request with the raw value so bad rows are visible.

### 2.5 Wire it into the organizations module

- Rename the `:id` param to `:organizationId` on the five
  `/api/organizations/:id/...` routes and in the controller casts. URL shape
  is unchanged.
- `PUT /api/organizations/:organizationId/profile` and
  `POST /api/organizations/:organizationId/onboarding/complete` get
  `routeMiddlewares: [requireAuth, requirePermission("settings:manage")]`.
- In `service.ts` remove `canManage` and the `forbidden` branch. `denyManage`
  becomes a status-only check (rename to `denyInactive(organizationId)`):
  returns `"not-found"` when the org row is gone, `"inactive"` when unpaid,
  `null` otherwise. `WriteResult.error` is now `"not-found" | "inactive"`.
  Controllers drop the `forbidden` case from `respondWriteError`.
- `GET status` and `GET onboarding` stay membership-only (any member may read);
  they keep their current 404-for-non-member behaviour.

### 2.6 Tests

`modules/auth/tests/permissions.test.ts` (pure, no DB):
- For each role, `ROLE_PERMISSIONS[role]` equals the exact expected list.
- `owner` equals `PERMISSIONS`.
- `staff ⊂ admin ⊂ owner`.
- `hasPermission(["staff","admin"], "billing:manage")` false; with `"owner"` true (union).
- `parseMemberRoles("owner, admin")` → `["owner","admin"]`; `"member"` → `[]`; `""` → `[]`.
- `orgAccessRoles` sanity: `staff` statements contain `bookings: ["read","write"]` and no `organization` actions; `owner` contains `organization: ["update","delete"]`.

`modules/auth/tests/requirePermission.test.ts` (DB, reuse the fake-ctx pattern
from `middleware.test.ts` plus the user/org seeding helpers from
`organizations.test.ts`, extracted into `test/helpers.ts` if that keeps things
short):
- `sessionFrom` missing → throws.
- No `organizationId` param and no active org → 400.
- Outsider → 404.
- staff + `bookings:read` → next() called; staff + `settings:manage` → 403.
- admin + `billing:manage` → 403; owner + `billing:manage` → passes.
- Row with role `"member"` → 403.
- Row with role `"staff,admin"` → union passes `settings:manage`.
- Active-org fallback: session row with `activeOrganizationId`, no param → resolves.
- `membershipFrom(ctx)` returns `{ organizationId, roles }` after success.

Better Auth integration (in the same file): seed a staff session whose session
row has `activeOrganizationId`, then
`auth.api.hasPermission({ headers, body: { permissions: { bookings: ["write"] } } })`
is true and `{ settings: ["manage"] }` is false. This proves the plugin sees our
roles, which the invite endpoints will rely on later.

`organizations.test.ts`: change `joinAsMember` to insert role `"staff"` and
rename it `joinAsStaff`. Expectations (403 on profile/complete) stay.

### 2.7 Verify

`bun run test:server`, `bun run typecheck`, `bun run check`.
`grep -rn '"owner"\|"admin"\|"staff"\|"member"' Sinwy.Backend/modules` should
only match tests and the `memberHasRole("owner")` ownership query.

---

## Phase 3 — Frontend

### 3.1 Auth client

`shared/lib/auth/auth-client.ts`: pass `ac` and `roles: orgAccessRoles` to
`organizationClient(...)` alongside the existing `schema`. This types the
`role` argument of invite/update calls for Phase 10 and keeps both plugin
configs on one source.

### 3.2 Member access in the org shell context

New `shared/lib/auth/permissions.ts`:

```ts
export type MemberAccess = { roles: OrgRole[] };

export const memberAccessQuery = (organizationId: string) => ({
	queryKey: ["organizations", organizationId, "member"] as const,
	queryFn: async (): Promise<MemberAccess> => {
		const { data, error } = await authClient.organization.getActiveMember();
		if (error || !data) throw new Error(error?.message ?? "Not a member");
		return { roles: parseMemberRoles(data.role) };
	},
	staleTime: 60_000,
});
```

`modules/org-dashboard/routes/_shell.tsx` `beforeLoad`, after `setActive`:

```ts
const member = await context.queryClient
	.ensureQueryData(memberAccessQuery(data.id))
	.catch(() => null);
if (!member) throw redirect({ to: "/" });
return { ...ctx, organization: data, member };
```

`ensureQueryData` keeps preload-on-intent and in-dashboard navigation from
refetching on every click; a reload (or the stale window passing) picks up a
DB role change, which satisfies the done criterion.

### 3.3 `requirePermission` route helper

In `shared/lib/auth/protected-route.ts`, next to `requireAuth`:

```ts
type OrgRouteContext = { organization: { slug: string }; member: MemberAccess };

/**
 * beforeLoad for routes under the org shell. Denied → toast + redirect to the
 * org home, which requires no permission so this can never loop.
 */
export const requirePermission =
	(permission: Permission) =>
	({ context }: { context: OrgRouteContext }) => {
		if (hasPermission(context.member.roles, permission)) return;
		toast.add({
			id: "permission-denied",
			type: "error",
			title: "You don't have access to that page",
			timeout: 5_000,
		});
		throw redirect({
			to: "/$organizationSlug",
			params: { organizationSlug: context.organization.slug },
		});
	};
```

Fixed toast id so rapid repeated denials do not stack. Check once by hand that
the toast survives a hard load straight onto a denied URL (root renders the
`Toaster` before child `beforeLoad`s run, so it should). If it does not, park
the message in a module variable and flush it from an effect in
`OrganizationShell`.

### 3.4 `usePermissions()`

Same file as 3.2:

```ts
export function usePermissions() {
	const ctx = useRouteContext({ strict: false }) as Partial<OrgRouteContext>;
	const roles = ctx.member?.roles ?? [];
	return {
		roles,
		can: (permission: Permission) => hasPermission(roles, permission),
	};
}
```

Outside the org shell (account dashboard, funnel) `can` is always false and
`roles` is empty, which is the right answer there.

### 3.5 Nav items carry a permission; the sidebar filters

- `SidebarNav.tsx`: add `permission?: Permission` to `SidebarNavLink` and to
  group sub-items. Groups themselves carry none; a group is shown only if at
  least one sub-item survives.
- New pure helper `shared/components/shell/nav-filter.ts`:
  `filterNav(items, can): SidebarNavItem[]`. Items without a permission are
  always kept.
- `SidebarNav` calls `usePermissions()` and renders `filterNav(items, can)`.
  The account sidebar has no permissions on its items and is unaffected.
- `modules/org-dashboard/lib/nav.tsx` assignments:

| Item | Permission |
| --- | --- |
| Overview | none |
| Bookings | `bookings:read` |
| Services | `services:read` |
| Customers | `customers:read` |
| Pages | `pages:read` |
| Payments | `payments:read` |
| Analytics | `analytics:read` |
| Team | `team:manage` |
| Settings › General | `settings:manage` |
| Settings › Billing | `billing:manage` |

### 3.6 Routes declare their permission in `beforeLoad`

Declare once on the section layout route so index and detail children inherit it:

| Route file | `beforeLoad` |
| --- | --- |
| `_shell.index.tsx` | none |
| `_shell.bookings.tsx` | `requirePermission("bookings:read")` |
| `_shell.services.tsx` | `requirePermission("services:read")` |
| `_shell.customers.tsx` | `requirePermission("customers:read")` |
| `_shell.pages.tsx` | `requirePermission("pages:read")` |
| `_shell.payments.tsx` | `requirePermission("payments:read")` |
| `_shell.analytics.tsx` | `requirePermission("analytics:read")` |
| `_shell.team.tsx` | `requirePermission("team:manage")` |
| `_shell.settings.tsx` | `requirePermission("settings:manage")` |
| `_shell.settings.billing.tsx` | `requirePermission("billing:manage")` (on top of the parent's) |

Index and `$id` routes under a gated layout add nothing. Write permissions on
detail pages come with the real features.

`modules/organizations/routes/$id.onboarding.tsx` sits outside the shell but
its backend writes are now `settings:manage`. After `setActive`, fetch
`memberAccessQuery(params.id)` and, when `settings:manage` is missing, redirect
to `/$organizationSlug` with the same toast. Do this inline in that route's
`beforeLoad` rather than reusing `requirePermission`, since the context shape
differs.

### 3.7 Tests (bun test, pure)

- `shared/tests/nav-filter.test.ts`: unpermissioned items kept; gated items
  dropped when `can` is false; group hidden when all children drop; group kept
  with the surviving subset.
- `shared/tests/permissions-route.test.ts`: `requirePermission("team:manage")`
  returns `undefined` for an owner context; for a staff context it throws a
  value for which `isRedirect()` is true with `to: "/$organizationSlug"`.
  Mock `#/shared/components/ui/toast` with `mock.module` so the manager is not
  touched.

### 3.8 Verify

`bun run test:web`, `bun run typecheck`, `bun run check`.
`grep -rn '"owner"\|"admin"\|"staff"' Sinwy.WebFrontend/src` should match
nothing outside tests.

---

## Phase 4 — End-to-end check and docs

1. `bun run db:up`, `bun run db:migrate`, `bun run start`.
2. Log in as an org owner: full sidebar, every section reachable.
3. In `bun run db:ui`, set that member's `role` to `staff`, reload the
   dashboard: sidebar shows Overview, Bookings, Services, Customers, Pages
   only. Type `/<slug>/team` in the address bar: redirected to Overview with
   the error toast. `PUT /api/organizations/<id>/profile` as that user → 403.
4. Set the role to `admin`: everything except Settings › Billing;
   `/<slug>/settings/billing` redirects.
5. Set the role back to `owner`.
6. Add a short "Roles & permissions" section to `docs/user-creation-roadmap.md`
   under 7.5 or as a new subsection: the three roles, the matrix table, where
   the source of truth lives, and that Better Auth's built-in endpoints follow
   `defaultStatements` per role.

## Out of scope (Phase 10 and later)

- Invitations, member list UI, changing roles from the app.
- Per-plan limits on team size (Polar entitlement).
- Write permissions on detail pages and any `hasPermission`-driven UI inside a
  page (buttons, forms); `usePermissions().can(...)` is ready for that.
- Live propagation of role changes to open sessions.
