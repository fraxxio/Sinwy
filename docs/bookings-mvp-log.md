# Bookings MVP log

Finished phases of [bookings-mvp-plan.md](bookings-mvp-plan.md).

---

## Phase 1: Move the dashboard to `/dashboard/$organizationSlug`

**Goal:** The org dashboard lives under `/dashboard/$organizationSlug`, every link and redirect points there, and the root slug is free for the storefront.

**Files:**
- `Sinwy.WebFrontend/src/routes.ts`: mount `modules/org-dashboard/routes` at `/dashboard/$organizationSlug`, keep the root slug last, and leave a comment that the storefront will take it.
- Every route file in `modules/org-dashboard/routes/` (`createFileRoute("/$organizationSlug/...")` ids), then regenerate `src/routeTree.gen.ts`.
- Links and redirects:
  - Dashboard: `modules/org-dashboard/components/OrganizationSidebar.tsx`, `ServiceActions.tsx`, `ServicesTable.tsx`, `org-dashboard/lib/nav.tsx`, `org-dashboard/lib/sections.ts`.
  - Shell and auth: `src/shared/components/shell/OrganizationSwitcher.tsx`, `src/shared/lib/auth/protected-route.ts`, `modules/auth/lib/post-login.ts`.
  - Organizations and account: `modules/organizations/lib/funnel.ts`, `modules/organizations/routes/$id.onboarding.tsx`, `modules/account-dashboard/routes/_shell.organizations.tsx`.
- Tests: `modules/auth/tests/post-login.test.ts`, `modules/organizations/tests/funnel.test.ts`, `src/shared/tests/permissions-route.test.ts`.
- `Sinwy.Backend/modules/organizations/utils.ts` (`reservedSlugs`) and its tests.

**Steps:**
- This is a pure move: no behaviour changes. Grep `"/$organizationSlug` and `organizationSlug` after the change and leave none pointing at the old root.
- Add `dashboard`, `book`, `s` and `app` to `reservedSlugs`. Check the dev DB for existing org slugs that collide (`psql service=sinwy_ro -c "select id, slug from organization where slug in ('dashboard','book','s','app') limit 10"`) and rename any with `sinwy_rw`.
- After this phase, nothing serves the root slug; the storefront arrives in Phase 5.
- Update `docs/user-flow-map.md` wherever it names dashboard URLs.

**Tests that matter:**
- Post-login and funnel redirects land on `/dashboard/<slug>`.
- The permission guard redirect still works under the new prefix.
- Reserved slugs: creating an org named "Dashboard" gets a different slug.

**Done when:**
- Every dashboard page opens under `/dashboard/<slug>`, `bun run verify` passes, and no source path builds a root-level dashboard URL.

**Verify:** Seed `org-with-staff`. Log in as the owner; post-login lands on `/dashboard/<slug>`. Click every sidebar entry, the services list, a service editor and the hours page; each URL starts with `/dashboard/<slug>`. Use the org switcher, then log in as staff and open a page staff can't see (e.g. settings): they're redirected inside `/dashboard/<slug>`. Opening `/<slug>` shows the not-found page. Nothing is simulated.

### Log (2026-11-02, `feat(backend, web): move the org dashboard under /dashboard`)
- Shipped: `routes.ts` mounts `modules/org-dashboard/routes` at `/dashboard/$organizationSlug`, and every route id, link and redirect uses the new prefix (sidebar, sections, switcher, permission guard, post-login, funnel, onboarding, Account → Organizations). `reservedSlugs` gains `app`, `book`, `dashboard` and `s`, and the org test checks that "Dashboard" gets a suffixed slug. The e2e skill's app map names the new URL.
- Differs from plan: `docs/user-flow-map.md` names no dashboard URLs, so it's unchanged. No dev org slugs collided with the new reserved ones. Biome rewrapped the longer `createFileRoute` ids.
- Checked in the running app: owner and staff post-login land on `/dashboard/<slug>`; every sidebar entry, the services list, new service, the editor, Duplicate and the hours page stay under it; the switcher and Account → Organizations open `/dashboard/<slug>` for two active orgs; staff opening settings, team, payments or analytics are sent back to `/dashboard/<slug>` with the access notice; `/<slug>` and `/<slug>/services` are 404. Seen but older than this phase: the not-found page is TanStack's default text (no `notFoundComponent`), and opening an org you don't belong to redirects to `/` with no message. Not checked: the "Finish setup" button on an un-onboarded org's overview.
