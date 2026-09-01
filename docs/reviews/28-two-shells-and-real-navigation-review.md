# Code review — Phase 0: Two shells and real navigation (issue #28)

Branch `28-two-shells-and-real-navigation` vs `master`, reviewed 2026-09-01.

**Verification status:** `bun run build` clean, `routeTree.gen.ts` committed and
stable after regeneration, `bun test` 58/58 pass, `rg 'url: "#"'` empty, no
leftover `modules/dashboard/` directory. `bunx biome check` fails, but only on
four pre-existing files untouched by this branch (see item 8).

The implementation matches the plan faithfully, including all four upfront
decisions (module naming, inactive orgs in the switcher, role-less
`OrganizationSummary`, shared `PageHeader`/`EmptyState`). Tests are honest:
`postLoginDestination` is a pure function tested with real fixtures and real
expectations; the deleted onboarding-redirect test matches deliberately deleted
behavior, and the toast mechanism it defers to exists at the root. No cheating
found.

---

## Should fix

1. **Breadcrumb links are plain anchors — full page reloads and untyped URLs.**
   [AppShell.tsx:79](Sinwy.WebFrontend/src/shared/components/shell/AppShell.tsx#L79)
   renders `<BreadcrumbLink href={crumb.href}>`, which defaults to a raw `<a>`,
   so clicking a crumb triggers a full document navigation instead of router
   navigation. The `href` values are also hand-built strings —
   `` href: `/${organization.slug}` `` in
   [org-dashboard/routes/_shell.tsx:27](Sinwy.WebFrontend/src/modules/org-dashboard/routes/_shell.tsx#L27) —
   which is exactly the untyped-URL class this branch set out to eliminate with
   `linkOptions`. Fix: `BreadcrumbLink` supports a `render` prop, so pass
   `render={<Link …/>}`; ideally make `Crumb` carry `LinkOptions` instead of an
   `href` string.

2. **Breadcrumb React key is the user-controlled label.**
   [AppShell.tsx:66](Sinwy.WebFrontend/src/shared/components/shell/AppShell.tsx#L66)
   keys crumbs by `crumb.label`. The root crumb is the organization name; an
   organization named "Bookings" visiting `/bookings` produces duplicate keys.
   Key by `crumb.href` or index.

3. **Breadcrumb trails skip intermediate levels on nested pages.**
   `/[slug]/settings/billing` renders "OrgName / Billing" (no "Settings"), and
   `/[slug]/bookings/$id` renders "OrgName / Booking" (no "Bookings"), because
   sections are flat sibling routes — there is no `_shell.settings.tsx` /
   `_shell.bookings.tsx` layout route carrying the section crumb, so
   `useMatches()` never sees one. Acceptable for stubs, but every real detail
   page will want its parent crumb, and retrofitting means introducing section
   layout routes and re-nesting file names later. Decide the pattern now
   (pathless section layouts with `staticData.crumb` + `<Outlet/>`) or record
   this as accepted debt.

4. **`SidebarNavItem.link` is dead data on parent items.**
   In [SidebarNav.tsx](Sinwy.WebFrontend/src/shared/components/shell/SidebarNav.tsx),
   items with `items` render as a `CollapsibleTrigger` only — the declared
   `link` and `activeOptions` are silently ignored. The org nav's Settings entry
   ([org-dashboard/lib/nav.tsx:170-187](Sinwy.WebFrontend/src/modules/org-dashboard/lib/nav.tsx#L170-L187))
   declares a link that does nothing: clicking "Settings" only toggles the
   collapse, and the parent never shows active state when a settings page is
   open. Make the type honest — a discriminated union where parent items have
   `items` but no `link`/`activeOptions` — or render the parent as a
   navigating link. Related UX gap: in icon-collapsed mode, sub-items
   (Billing) are hidden by the sidebar CSS, so Billing becomes unreachable
   from the nav (stock shadcn behavior, but worth knowing).

5. **`org.status as OrganizationStatus` is an unchecked cast, and `status` is
   currently unused.**
   [OrganizationSwitcher.tsx:39](Sinwy.WebFrontend/src/shared/components/shell/OrganizationSwitcher.tsx#L39)
   casts Better Auth's `string` straight to the union — the plan's stated
   purpose of `OrganizationSummary` was to "narrow once", but a cast asserts
   without narrowing. Nothing consumes `status` yet, so it's harmless today;
   before Phase 3 starts branching on it, replace the cast with a real
   narrowing/validation helper (e.g. a Zod parse or a type guard in
   `@sinwy/shared`) so an unexpected backend value fails loudly.

## Tech debt / minor

6. **The account shell hand-rolls what `protectedRoute` already provides.**
   [account-dashboard/routes/_shell.tsx:6-12](Sinwy.WebFrontend/src/modules/account-dashboard/routes/_shell.tsx#L6-L12)
   sets `ssr: false` + `beforeLoad: requireAuth` manually;
   [protected-route.ts:25-28](Sinwy.WebFrontend/src/modules/auth/lib/protected-route.ts#L25-L28)
   exports `protectedRoute` for exactly this case. Spread it.

7. **Duplicated user-label fallback.** `session?.user.name ||
   session?.user.email || ""` appears in both
   [NavUser.tsx:45](Sinwy.WebFrontend/src/shared/components/shell/NavUser.tsx#L45)
   and
   [OrganizationSwitcher.tsx:52](Sinwy.WebFrontend/src/shared/components/shell/OrganizationSwitcher.tsx#L52).
   Extract a small `displayName(user)` helper next time either changes.

8. **`bunx biome check` at the repo root can never pass** — it fails on four
   pre-existing generated/config files (`Sinwy.Backend/drizzle/meta/*.json`,
   `Sinwy.WebFrontend/components.json`), which silently invalidates the
   verification step every plan lists. Add them to Biome's ignore list in a
   separate housekeeping change.

9. **`shared/components/shell/` depends on `#/modules/auth/lib/auth-client`**
   (`NavUser`, `OrganizationSwitcher`). This shared→module deep import predates
   the branch (`shared/components/Header.tsx` on master does the same), and the
   frontend has no `index.ts` public-API convention at all — the CLAUDE.md
   module-boundary rule is currently backend-only. Moving these components into
   `shared/` extends the pattern rather than introducing it, but it means
   "shared" is not actually module-independent. Worth an explicit decision:
   either bless auth as a foundational dependency frontend-wide, or give
   frontend modules the same `index.ts` boundary the backend has.

10. **Test-coverage gap (small):** `post-login.test.ts` covers active-id,
    null-id, inactive-org and no-org cases, but not a *stale* active id (an
    `activeOrgId` no longer in the list should fall back to the last
    organization). One extra case would pin that behavior.

## Explicitly fine (checked, no action)

- Route registration order (`/account` above `/$organizationSlug`) preserved
  with its explanatory comment.
- `data-active` styling works: Tailwind's `data-active:` variant matches
  attribute presence, so `activeProps={{ "data-active": "" }}` lights up
  correctly against the sidebar's `data-active:` classes.
- Switcher never calls `setActive`; the org shell's `beforeLoad` re-runs on
  param change, exactly as the plan specifies. Leaving to `/account` keeps the
  active org, matching the login-lands-in-last-org rule.
- The `isPending` trigger fallback avoids flashing "Personal account" inside an
  org shell.
- Inert `NavUser` dropdown entries and empty-state-only pages are
  plan-sanctioned Phase 2 scope, not debt.
