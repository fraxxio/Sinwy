# Phase 0 — Two shells and real navigation (steps 1–7 done)

Implementation plan for [issue #28](https://github.com/fraxxio/Sinwy/issues/28).
Companion: the route map and mode-differentiation rules in the
[Dashboard Roadmap](https://github.com/fraxxio/Sinwy/issues/20).

**Goal:** Customer Mode (`/account/*`) and Organization Mode
(`/$organizationSlug/*`) both exist as real shells with real navigation. Pages
are empty states — this phase delivers structure, not features.

**Done when:** a user with no organization lands on `/account` and can browse
every customer page; an owner can switch into an organization and browse every
org page; no `url: "#"` remains anywhere.

---

## Decisions taken before starting

1. **`modules/dashboard/` is renamed to `modules/org-dashboard/`** (Organization
   Mode: shell + org routes + org sidebar), and Customer Mode lives in
   `modules/account-dashboard/`. The shared chrome moves to
   `shared/components/shell/`. No module imports another module's internals.
2. **The switcher routes every organization to `/$slug`**, including `inactive`
   (created-but-unpaid) ones. Status gating is Phase 3's job (org-inactive
   read-only banner); Phase 0 does not branch on it.
3. **`OrganizationSummary` carries no `role`.** `organization.list()` returns
   organizations joined off `member` but strips the role, so there is no
   client-side source for it today. Roles land in Phase 1, which defines the
   role set and the permission map anyway.
4. **Shared `PageHeader` + `EmptyState` are built now** (roadmap #20 asks for
   cross-cutting UI states to be decided once in Phase 0). Skeletons, error
   boundaries and permission-denied states stay out of this phase.

### Naming note

The two shells are named as a pair — `org-dashboard` / `account-dashboard` — so
neither collides with the existing `modules/organizations/` (the create → plan →
onboarding funnel at `/organizations/*`), and so the symmetry is visible in the
directory listing:

- `organizations` — getting an organization *created and paid for*
- `org-dashboard` — working *inside* an organization (Organization Mode)
- `account-dashboard` — the signed-in user's own surface (Customer Mode)

This deviates from the ticket's literal `modules/account/`; the route prefix
stays `/account`, only the module directory differs. Note the mild tension with
CONTEXT.md, which lists "Personal dashboard" as wording to avoid for *Customer
Mode* — that rule is about how we describe the mode in product language, not
about directory names. Keep the modes called Customer Mode and Organization Mode
in copy, comments and docs.

---

## Target structure

```text
src/
├── shared/components/
│   ├── EmptyState.tsx                 new
│   ├── PageHeader.tsx                 new
│   └── shell/
│       ├── AppShell.tsx               was DashboardLayout.tsx
│       ├── SidebarNav.tsx             was NavMain.tsx
│       ├── NavUser.tsx                moved as-is
│       └── OrganizationSwitcher.tsx   was TeamSwitcher.tsx
│
├── modules/org-dashboard/             was modules/dashboard/
│   ├── components/OrganizationSidebar.tsx
│   ├── lib/nav.ts
│   └── routes/                        _shell.tsx + 13 pages
│
└── modules/account-dashboard/         new
    ├── components/AccountSidebar.tsx
    ├── lib/nav.ts
    └── routes/                        _shell.tsx + 7 pages
```

Deleted: `modules/dashboard/components/NavProjects.tsx`,
`modules/dashboard/routes/_shell.home.tsx` (becomes `_shell.index.tsx`).

---

## Step 1 — Shared: `OrganizationSummary`

`Sinwy.Shared/types/organization/OrganizationSummary.ts`:

```ts
export type OrganizationSummary = {
	id: string;
	name: string;
	slug: string;
	status: OrganizationStatus;
};
```

Re-export from `types/organization/index.ts`.

Better Auth types `status` as `string` (it comes from the client plugin's
`additionalFields` mirror), so the switcher's mapping narrows it once when
building summaries — that narrowing is the reason the type exists.

---

## Step 2 — Extract the shared chrome

### `shared/components/shell/AppShell.tsx`

Today's `DashboardLayout` hardcodes `<AppSidebar organizationName={...} />`.
Invert it: the sidebar becomes a slot, and the breadcrumb trail moves inside
(both shells built it identically from `useMatches()`).

```tsx
export function AppShell({
	sidebar,
	rootCrumb,
	children,
}: {
	sidebar: ReactNode;
	rootCrumb: { label: string; href: string };
	children: ReactNode;
}) { … }
```

- Keep `readSidebarCookie()` and the existing header/`SidebarInset` markup
  verbatim.
- Build the trail as `[rootCrumb, ...matches with staticData.crumb]`. The root
  crumb has to be a prop because the org label is runtime data (the
  organization's name) and `staticData` is static.
- `exactOptionalPropertyTypes` is on: keep `href` required on the crumb type
  rather than optional, and let the last crumb render as `BreadcrumbPage`
  regardless — that is what the current code already does.

Consequence: index routes (`_shell.index.tsx`) must **not** declare a `crumb`,
or the root would appear twice.

### `shared/components/shell/SidebarNav.tsx`

`NavMain` renamed and re-typed. Two changes beyond the move:

- Items carry TanStack link props instead of `url: string`, and render through
  `<Link>` so active state is real: `<SidebarMenuButton render={<Link {...item.link} />}>`.
  Keep the existing `biome-ignore lint/a11y/useAnchorContent` comment — Base UI
  still injects children into the rendered element.
- Only items with children wrap in `Collapsible`; flat items render a plain
  `SidebarMenuItem`. The org map has exactly one parent item (Settings), so
  rendering every item as a collapsible (today's behaviour) would be wrong.

Item shape:

```ts
type SidebarNavItem = {
	title: string;
	icon: ReactNode;
	link: LinkOptions;                       // from linkOptions()
	activeOptions?: { exact: boolean };
	items?: { title: string; link: LinkOptions }[];
};
```

Group label becomes a prop (`"Platform"` is demo copy) — org shell passes
`"Manage"`, account shell `"Your account"`.

### `shared/components/shell/NavUser.tsx`

Straight move, no changes. Its dropdown entries (Upgrade to Pro / Account /
Billing / Notifications) stay inert — Phase 2 owns them.

### Delete `NavProjects.tsx`

No replacement.

---

## Step 3 — `OrganizationSwitcher` (was `TeamSwitcher`)

Renamed per the CONTEXT.md language rules ("Team member record" is on the avoid
list; the entity is an Organization).

```tsx
export function OrganizationSwitcher({
	activeOrganizationSlug,
}: {
	activeOrganizationSlug: string | null;
}) { … }
```

- Data: `const { data, isPending } = authClient.useListOrganizations()`, mapped
  to `OrganizationSummary[]`. Drop the `useState`-held `activeTeam` — the URL is
  the source of truth now.
- **Trigger** shows the active organization's name with an "Organization"
  caption when `activeOrganizationSlug` matches a listed org; otherwise the
  session user's name with a "Personal account" caption.
- **Menu:**
  - group `Organizations` — one item per org, each
    `<Link to="/$organizationSlug" params={{ organizationSlug: org.slug }}>`.
    Inactive orgs are listed exactly like active ones (decision 2).
  - separator
  - `Personal account` → `<Link to="/account">`
  - `Create organization` → `<Link to="/organizations/new">` (the existing
    funnel, which lives outside both shells and keeps its own progress UI)
- While `isPending`, render the trigger from the shell-supplied context and skip
  the org group rather than flashing an empty list.
- Drop the `⌘{n}` `DropdownMenuShortcut`s — they are demo affordances with no
  handler behind them.

**Switching mechanics:** navigating to `/$organizationSlug` changes a route
param, so the org shell's `beforeLoad` re-runs and `setActive` fires for the new
slug. The switcher itself never calls `setActive`.

**Leaving to `/account` deliberately does not clear the active organization.**
The roadmap's rule is "login lands in the last active organization if one
exists, else Customer Mode" — clearing it on every visit to `/account` would
break that. Customer Mode is a route prefix, not a session state.

---

## Step 4 — Organization Mode: `modules/dashboard/` → `modules/org-dashboard/`

### `lib/nav.ts`

A function, because every link needs the slug:

```ts
export const organizationNav = (organizationSlug: string) => [
	{
		title: "Overview",
		icon: <LayoutDashboardIcon />,
		link: linkOptions({ to: "/$organizationSlug", params: { organizationSlug } }),
		activeOptions: { exact: true },
	},
	…
];
```

`linkOptions()` keeps each entry type-checked against the generated route tree,
which is what makes "no `url: "#"` remains" enforceable by the compiler rather
than by review. If its inference fights the union at the `<Link {...item.link}>`
call site, fall back to a plain object literal plus a single cast there — do not
loosen `to` to `string` across the map.

Map (icons are suggestions):

| Title | Route | Icon |
| --- | --- | --- |
| Overview | `/$organizationSlug` (exact) | `LayoutDashboardIcon` |
| Bookings | `/$organizationSlug/bookings` | `CalendarCheckIcon` |
| Services | `/$organizationSlug/services` | `WrenchIcon` |
| Customers | `/$organizationSlug/customers` | `UsersIcon` |
| Pages | `/$organizationSlug/pages` | `FileTextIcon` |
| Payments | `/$organizationSlug/payments` | `CreditCardIcon` |
| Analytics | `/$organizationSlug/analytics` | `ChartNoAxesColumnIcon` |
| Team | `/$organizationSlug/team` | `UsersRoundIcon` |
| Settings | `/$organizationSlug/settings` | `Settings2Icon` |
| ├ General | `/$organizationSlug/settings` | — |
| └ Billing | `/$organizationSlug/settings/billing` | — |

Detail routes (`bookings/$id`, `services/$id`, `customers/$id`, `pages/$id`) are
not nav entries; they exist as stubs so links from list pages have a target.

### `components/OrganizationSidebar.tsx`

`AppSidebar` renamed and rewritten: `OrganizationSwitcher` in the header,
`SidebarNav` with `organizationNav(slug)` in the content, `NavUser` in the
footer, `SidebarRail` unchanged.

### `routes/_shell.tsx`

Unchanged logic — `requireAuth`, `setActive({ organizationSlug })`, redirect to
`/` on failure, `ssr: false`, `staticData: { appShell: true }`. Only the render
changes:

```tsx
<AppShell
	sidebar={<OrganizationSidebar organizationSlug={organization.slug} />}
	rootCrumb={{ label: organization.name, href: `/${organization.slug}` }}
>
	<Outlet />
</AppShell>
```

The `useMatches`/breadcrumb block moves into `AppShell` and is deleted here.

### Route files

`_shell.home.tsx` → `_shell.index.tsx` (the roadmap map puts Overview at
`/$organizationSlug/`, and Step 6 points post-login there). Its grey-box demo
markup is replaced.

```text
_shell.index.tsx              /$organizationSlug/
_shell.bookings.index.tsx     /bookings
_shell.bookings.$id.tsx       /bookings/$id
_shell.services.index.tsx     /services
_shell.services.$id.tsx       /services/$id
_shell.customers.index.tsx    /customers
_shell.customers.$id.tsx      /customers/$id
_shell.pages.index.tsx        /pages
_shell.pages.$id.tsx          /pages/$id
_shell.payments.tsx           /payments
_shell.analytics.tsx          /analytics
_shell.team.tsx               /team
_shell.settings.index.tsx     /settings
_shell.settings.billing.tsx   /settings/billing
```

Use `.index.tsx` (not a bare `.tsx`) wherever a sibling `$id` route exists —
`_shell.bookings.tsx` alongside `_shell.bookings.$id.tsx` would turn the former
into a layout route that must render an `<Outlet />`.

---

## Step 5 — Customer Mode: `modules/account-dashboard/`

### `routes/_shell.tsx`

```tsx
export const Route = createFileRoute("/account/_shell")({
	ssr: false,
	beforeLoad: requireAuth,
	staticData: { appShell: true },
	component: AccountShell,
});
```

Session-only: no `setActive`, no membership check, no org context. `ssr: false`
is required because `requireAuth` reads cookies through `authClient`
client-side. Renders `AppShell` with `AccountSidebar` and
`rootCrumb = { label: "Personal account", href: "/account" }`.

### `lib/nav.ts` + `components/AccountSidebar.tsx`

Same shape as the org side, without params.

| Title | Route | Icon |
| --- | --- | --- |
| Overview | `/account` (exact) | `LayoutDashboardIcon` |
| Bookings | `/account/bookings` | `CalendarCheckIcon` |
| Payments | `/account/payments` | `CreditCardIcon` |
| Organizations | `/account/organizations` | `Building2Icon` |
| Notifications | `/account/notifications` | `BellIcon` |
| Settings | `/account/settings` | `Settings2Icon` |

### Route files

```text
_shell.index.tsx              /account
_shell.bookings.index.tsx     /account/bookings
_shell.bookings.$id.tsx       /account/bookings/$id
_shell.payments.tsx           /account/payments
_shell.organizations.tsx      /account/organizations
_shell.notifications.tsx      /account/notifications
_shell.settings.tsx           /account/settings
```

`/account/organizations` gets a real primary action now (not a stub CTA):
"Create organization" → `/organizations/new`. It is the empty-dashboard entry
point the roadmap names in §4.

### `routes.ts`

```ts
export const routes = rootRoute("root.tsx", [
	physical("/", "modules/home/routes"),
	physical("/auth", "modules/auth/routes"),
	physical("/account", "modules/account-dashboard/routes"),
	physical("/organizations", "modules/organizations/routes"),
	physical("/checkout", "modules/checkout/routes"),
	// Dashboard lives at the root under the org slug, so it must stay last:
	// every static prefix above outranks this dynamic segment.
	physical("/$organizationSlug", "modules/org-dashboard/routes"),
]);
```

`/account` must sit above `/$organizationSlug`, otherwise `account` is swallowed
as an organization slug. The existing trailing comment already documents the
rule; keep it.

Note the asymmetry between prefix and directory: the URL prefix is `/account`
(the ticket's contract, and what `postLoginDestination` targets), while the
module directory is `account-dashboard`. `physical()` takes both independently,
so nothing needs to line up.

---

## Step 6 — Post-login routing

`modules/auth/lib/post-login.ts`:

```ts
export function postLoginDestination(
	organizations: { id: string; slug: string; status: string }[],
	activeOrgId: string | null | undefined,
) {
	const org =
		organizations.find((o) => o.id === activeOrgId) ?? organizations.at(-1);
	if (!org) return { to: "/account" } as const;
	if (org.status !== "active")
		return { to: "/organizations/$id/plan", params: { id: org.id } } as const;

	return {
		to: "/$organizationSlug",
		params: { organizationSlug: org.slug },
	} as const;
}
```

Three changes:

- no orgs → `/account` instead of `/` (Customer Mode now exists)
- active org → `/$organizationSlug` instead of `/$organizationSlug/home`
- the `onboardingCompletedAt` branch and parameter are removed

**The onboarding wizard stays reachable** after dropping that branch:
`UnfinishedOnboardingToast` is mounted at the root and raises a "Finish setup" →
`/organizations/$id/onboarding` prompt off `usePostLoginFlags`, on every route
outside the funnel. The redirect was a stand-in for the dashboard that did not
exist yet; the toast is the durable mechanism. Update the doc comment
accordingly.

The inactive-org → plan branch stays untouched: the payment funnel must remain
the only way into a paid organization.

### Tests

`modules/auth/tests/post-login.test.ts` — update the fixtures (drop
`onboardingCompletedAt`) and the three affected expectations:

- "prefers the active organization" → `/$organizationSlug`, `slug-b`
- "falls back to the last organization" → `/$organizationSlug`, `slug-c`
- "sends users without organizations to Customer Mode" → `{ to: "/account" }`
- delete "sends a paid organization that never finished setup to onboarding"
- keep the inactive → plan test as-is

---

## Step 7 — Shared page-level UI

`shared/components/PageHeader.tsx` — `title`, optional `description`, optional
`action` slot. Every stub route renders one.

`shared/components/EmptyState.tsx` — centred `icon`, `title`, `description`,
optional `action`. The primary-action slot matters: roadmap #20 explicitly rules
out bare "no data" states.

Each stub is then ~12 lines:

```tsx
export const Route = createFileRoute("/$organizationSlug/_shell/bookings/")({
	staticData: { crumb: "Bookings" },
	component: () => (
		<>
			<PageHeader title="Bookings" description="…" />
			<EmptyState
				icon={<CalendarCheckIcon />}
				title="No bookings yet"
				description="…"
			/>
		</>
	),
});
```

`$id` stubs read their param and render a header plus a "Nothing here yet"
empty state — enough that a link into them never dead-ends.

---

## Order of work

1. Shared `OrganizationSummary` (no dependencies).
2. `PageHeader` + `EmptyState`.
3. Move chrome into `shared/components/shell/` (`AppShell`, `SidebarNav`,
   `NavUser`); delete `NavProjects`. Keep the org shell compiling against it.
4. Rename `modules/dashboard/` → `modules/org-dashboard/`, update `routes.ts`,
   add `lib/nav.ts` + `OrganizationSidebar`, convert `_shell.home` →
   `_shell.index`, add the remaining org stubs.
5. `OrganizationSwitcher` — needs both shells' targets to exist, so it comes
   after the `/account` routes are registered. Build
   `modules/account-dashboard/` (Step 5) first, then the switcher.
6. `postLoginDestination` + its tests.

Route ids in `createFileRoute(...)` are generated — run `bun run dev` (or
`build`) in `Sinwy.WebFrontend` after adding files and copy the ids from the
regenerated `routeTree.gen.ts` rather than hand-writing them. Commit the
regenerated tree.

---

## Verification

- `bun run build` in `Sinwy.WebFrontend` — the router plugin regenerates the
  route tree, and `linkOptions` makes any typo'd route a type error.
- `bun test` in `Sinwy.WebFrontend` — post-login tests.
- `bunx biome check` at the repo root.
- Manual: a user with no organization logs in → `/account`, every sidebar item
  opens a titled page. Create an organization → the funnel is untouched. An
  owner logs in → `/$slug`, every sidebar item opens a titled page, the switcher
  lists their organizations and moves between them, "Personal account" returns
  to `/account`, and going back to an org still works.
- `rg 'url: "#"' Sinwy.WebFrontend/src` returns nothing.

---

## Explicitly out of scope

- Role-based nav filtering and route permission declarations — Phase 1.
- Wiring `NavUser`'s dropdown entries and any real account settings — Phase 2.
- Status/plan gating of org pages and the inactive-org banner — Phase 3.
- Loading skeletons, error boundaries, permission-denied and plan-gated states.
- Any backend work: no new tables, endpoints or modules in this phase.
