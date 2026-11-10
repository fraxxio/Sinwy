# Team invites log

Finished phases of [team-invites-plan.md](team-invites-plan.md), each with its spec and log entry.

## Phase 1: Seats, invite roles and the invitation email

**Goal:** Inviting sends a real email, refuses non-app roles, and stops at the plan's seat cap.

**Files:**
- `Sinwy.Shared/types/plan/PlanLimits.ts` (`PlanLimits`, `PLAN_LIMITS`, `NO_PLAN_LIMITS`)
- `Sinwy.Backend/modules/billing/tests/planFeatures.test.ts` (pins `PLAN_LIMITS`)
- `Sinwy.Backend/modules/auth/auth.ts` (`organization({...})` options and `organizationHooks`, `rateLimit.customRules`)
- `Sinwy.Backend/modules/auth/singleOwner.ts` (`refuseOwnerRole`; the role rule sits next to it)
- `Sinwy.Backend/modules/auth/emails/` (new `invitationEmail.ts`, pattern of `verificationEmail.ts`)
- `Sinwy.Backend/modules/organizations/repository.ts` (new seat count next to `findInvitationOrganizationId`), `service.ts` (`getOrganizationAccess`, `organizationPlanOf`), `index.ts`
- `Sinwy.Shared/types/access/OrgRole.ts` (`parseMemberRoles`)
- Tests: `Sinwy.Backend/modules/auth/tests/` (new `invitations.test.ts`; patterns in `singleOwner.test.ts`, `organizationEndpoints.test.ts`)
- Docs: `docs/org-rules-map.md` sections 2 (roles), plan limits (around "Enforced in: `Sinwy.Shared/types/plan/`"), 11 and the known-gaps list (`invite-member` accepts `role: "member"`); `.agents/skills/e2e-test/references/seed-scenario.md` (the staff caveat)

**Steps:**
- Add `members` to `PlanLimits` (3 / 10 / 25, 0 with no plan) and pin it in the plan test.
- Organizations module exposes a seat count for an org: members plus pending invitations with `expiresAt` in the future. Auth calls it through `@organizationsModule`, never the repository.
- `beforeCreateInvitation`: after the existing checks, refuse when seats used ≥ the org plan's `members` limit, with a clear message and an `API_ERROR_CODES`/`AUTH_ERROR_CODES` code the frontend can match (add one if none fits, and keep it in the `deliberateCodes` set's source).
- `membershipLimit`: the org plan's `members` limit, as the accept-time backstop.
- Role rule (Default 2) in `beforeCreateInvitation` and `beforeUpdateMemberRole`, next to `refuseOwnerRole`.
- `invitationExpiresIn` 7 days; custom rate limit on `/organization/invite-member` (Default 6).
- `sendInvitationEmail`: `InvitationEmail` with org name, inviter name, role and a link to `${WEB_APP_URL}/invite/<id>`; escape every interpolated value.
- Update the docs listed above in the same commit.

**Tests that matter:**
- Invite at the cap → refused; an expired pending invite frees its seat; cancel frees a seat; resend at the cap still works.
- Over the cap after a downgrade: existing members keep access, a new invite is refused.
- Inactive org (no plan) → invite refused; role `member`, `owner` or `admin,staff` → refused on invite and on role change.
- Invite sends one email to the invitee with the `/invite/<id>` link, and an org name with HTML in it arrives escaped.

**Done when:**
- `bun run verify` exits 0 and the invitation email shows up in the outbox for a valid invite.

**Verify:** Seed `subscribed-org` (Starter). As the owner, call `POST /api/auth/organization/invite-member` with role `staff` for two new addresses: both succeed, two `invitation` rows are `pending`, two emails link to `/invite/<id>`. A third invite → refused for seats (owner + 2 pending = 3). Role `member` → refused. Polar is not involved; the plan is seeded.

### Log (2026-11-10, `feat(backend, shared): cap organization seats per plan and email invitations`)
- Shipped: `members` in `PLAN_LIMITS` (3 / 10 / 25, 0 without a plan); `countSeatsUsed` and `getSeatLimit` / `getSeatUsage` in the organizations module; `beforeCreateInvitation` refuses at the cap with 403 `SEAT_LIMIT_REACHED` (new `AUTH_ERROR_CODES` entry) and refuses any role but `admin`/`staff` (`refuseNonInviteRole` in `singleOwner.ts`, also on role change, 400 "Choose admin or staff"); `membershipLimit` uses the seat limit; `invitationExpiresIn` 7 days (`INVITATION_EXPIRY_DAYS` in `Sinwy.Shared/types/organization/Invitation.ts`); rate limit 10/60 s on invite; `InvitationEmail` with every value escaped, linking to `${WEB_APP_URL}/invite/<id>`. Shared `INVITE_ROLES` / `isInviteRole` in `OrgRole.ts` for the frontend. 13 tests in `modules/auth/tests/invitations.test.ts`; docs in `org-rules-map.md` (sections 2, 5 seats, 11 invitations, 13 codes, gap removed) and the seed caveat.
- Differs from plan: the standing note said `invitationLimit` counts expired pending invites; the plugin's `findPendingInvitations` and `findPendingInvitation` both filter out expired ones. So resending an expired invite doesn't extend it: the plugin creates a new invitation, which goes through the seat check (no bypass). Accept-time refusal is the plugin's own `ORGANIZATION_MEMBERSHIP_LIMIT_REACHED`, not our code.
- Checked in the running app (API only, e2e subagent): on a seeded Starter `subscribed-org`, role `member` → 400 with no row or email; two staff invites → 200, two `pending` rows expiring in 7 days, two emails linking to `/invite/<id>`; a third → 403 `SEAT_LIMIT_REACHED`, no row, no email. Backend log clean. Not checked: a real Resend delivery of the template, and opening the link (Phase 4).


## Phase 2: Public invitation preview

**Goal:** Anyone holding an invite link can see what it's for, signed in or not.

**Files:**
- `Sinwy.Backend/modules/organizations/` (`routes.ts` `registerOrganizationRoutes`, `controller.ts`, `service.ts`, `repository.ts` near `findInvitationOrganizationId` and `countSeatsUsed`)
- `Sinwy.Backend/modules/organizations/utils.ts` (`reservedSlugs`)
- Unauthenticated routes elsewhere live under `/api/public/…` (`modules/bookings/routes.ts` `STOREFRONT`, `modules/pages/routes.ts`); match that prefix unless there's a reason not to
- `Sinwy.Shared/types/organization/Invitation.ts` (has `INVITATION_EXPIRY_DAYS`; add the preview DTO and Zod schema here)
- Tests: `Sinwy.Backend/modules/organizations/tests/` (new `invitationPreview.test.ts`; seed invitations by direct insert as in `modules/auth/tests/invitations.test.ts`)

**Steps:**
- `GET /api/invitations/:invitationId`, no auth. Returns the Default 5 shape; unknown id, canceled, rejected, accepted, or org scheduled for deletion → `unavailable` (same 404 body for all, so it reveals nothing).
- Map from DB rows to the shared DTO; no raw Drizzle types out.
- Add `invite` to the reserved organization slugs.

**Tests that matter:**
- Pending, expired, canceled, accepted and unknown ids each give the right status; a scheduled org gives `unavailable`.
- The response carries no ids or emails beyond the invitation's own.

**Done when:**
- The endpoint answers for every status without a session, and `bun run verify` exits 0.

**Verify:** Seed `subscribed-org`, invite an address as the owner, then `curl` the preview with no cookie: pending, with org name, inviter and role. Cancel the invite and repeat: unavailable. Nothing simulated.

### Log (2026-11-10, `feat(backend, shared): add a public invitation preview`)
- Shipped: `GET /api/public/invitations/:invitationId` (organizations module: `findPendingInvitationPreview` joins org and inviter, `getInvitationPreview` maps to the shared DTO). Pending → 200 `pending` or, past `expiresAt`, `expired`; unknown, canceled, rejected, accepted, org scheduled for deletion, or a stored role that isn't admin/staff → one 404 body. Shared `invitationPreviewSchema`, `InvitationPreviewDto` and `INVITATION_PREVIEW_STATUSES`. `invite` added to reserved slugs. 5 tests in `modules/organizations/tests/invitationPreview.test.ts`; `org-rules-map.md` invitations and reserved slugs updated.
- Differs from plan: path is `/api/public/invitations/:id`, not `/api/invitations/:id`, to match the other unauthenticated routes. `unavailable` is the 404 itself rather than a 200 body field, as the storefront does; the DTO's status is only `pending` or `expired`. The DTO also carries `expiresAt`. An inactive org (no plan) still previews as pending: accepting isn't refused there either.
- Checked in the running app (API only, e2e subagent): seeded Starter `subscribed-org`, owner invited an address as staff; outbox email links to `/invite/<id>`; cookie-less preview → 200 pending with org name, slug, inviter "Seed Owner", role staff, invitee email, no ids or other emails. Canceled → 404 "This invitation is no longer available", byte-identical to an unknown id. Backend log clean. Expired, rejected, accepted and scheduled-org branches covered by tests only.


## Phase 3: Team page

**Goal:** Owners and admins run their team from `/dashboard/<slug>/team`.

**Files:**
- `Sinwy.WebFrontend/src/modules/org-dashboard/routes/_shell.team.tsx` (placeholder today)
- `Sinwy.WebFrontend/src/modules/org-dashboard/lib/transfer-queries.ts` (`transferCandidatesQuery` uses `authClient.organization.listMembers`; share the members query rather than duplicating it)
- `Sinwy.WebFrontend/src/modules/org-dashboard/components/` (new team components)
- `Sinwy.WebFrontend/src/shared/lib/auth/permissions.ts` (`usePermissions`), `auth-error.ts` (`authErrorMessage`)
- `Sinwy.WebFrontend/src/shared/components/UpgradePrompt.tsx` (seat cap reached)
- `Sinwy.WebFrontend/src/modules/account-dashboard/routes/_shell.organizations.tsx` (role label, around line 214)
- `docs/design-rules.md` (UI rules to follow)

**Steps:**
- Members table: name, email, role, joined date (`member.createdAt`), from `listMembers`.
- Invite dialog: email plus role (admin or staff); shows seats used / limit; at the cap, the button is replaced by the upgrade prompt. Seats come from members + pending invites on the page and `PLAN_LIMITS` for the org's plan (no new endpoint unless the plan isn't already on the page).
- Pending invites list from `listInvitations` (pending, not expired): resend (`inviteMember` with `resend: true`) and revoke (`cancelInvitation`).
- Role change and remove, each behind a confirmation; hidden on the owner's row and your own (Default 3).
- Refresh members, invitations and the member-access query after each change.
- Account → Organizations shows Owner, Admin or Staff (Default 8).

**Tests that matter:**
- Seat count shown matches the backend's rule (expired invites excluded).
- Row actions hidden for the owner and the current user.

**Done when:**
- Every team action works from the page with server errors shown in place, and `bun run verify` exits 0.

**Verify:** Seed `org-with-staff --staff 1` (Starter). Log in as the owner, open Team: owner and staff listed with joined dates, seats 2/3. Invite an address as admin: it appears under pending, an email is in the outbox, seats 3/3 and inviting is blocked with an upgrade prompt. Resend: same row, later expiry. Revoke: row gone, seats 2/3. Change staff to admin: `member.role` updates. Remove them: `member` row gone. Nothing simulated beyond the seeded plan.

### Log (2026-11-10, `feat(backend, shared, web): add the team page with invites, role changes and removal`)
- Shipped: Team page (`_shell.team.tsx`) with a members table (name, email, role badge, joined date), a pending-invitations table (unexpired only, Resend and Revoke per row, errors in the row), an invite dialog (email, admin or staff, seats used / limit) and per-member Make admin / Make staff and Remove behind confirmations with errors in the dialog. Seats are members plus unexpired pending invitations against `PLAN_LIMITS` for the plan from the shell's entitlements; at or over the cap the Invite button becomes "No seats left on this plan." plus `UpgradeAction` (or "Remove someone" on the top plan). Row actions are hidden on the owner and on yourself. Every change invalidates the team queries and `memberAccessQuery`. `transferCandidatesQuery` now selects from the shared `membersQuery`. `OrganizationSummary.role` plus shared `ORG_ROLE_LABELS` and `primaryRole`; Account → Organizations shows Owner, Admin or Staff. Tests: `modules/org-dashboard/tests/team.test.ts` (seat count with expired, canceled and accepted invites, no plan, over the cap; row actions on owner and self); backend summary test pins `role`. `org-rules-map.md` sections 11 and the gaps list updated.
- Differs from plan: `docs/design-rules.md` holds backend architecture only, so the UI follows the existing services and transfer screens. The upgrade prompt is `UpgradeAction` in the header, not the full-page `UpgradePrompt` (that one takes a yes/no feature, and seats are a number). Revoke has no confirmation, since the plan asks for one only on role change and removal, and re-inviting undoes it.
- Checked in the running app (e2e subagent, seeded Starter `org-with-staff --staff 1`): owner and staff listed with joined dates, 2 of 3 seats; invite as admin → pending row, outbox email with `/invite/<id>`, 3 of 3 and the upgrade prompt (a direct API invite at the cap → 403 `SEAT_LIMIT_REACHED`); resend → same id, later `expires_at`, second email; revoke → `canceled`, 2 of 3; Make admin → `member.role = admin`; Remove → the `member` row is gone. No console or backend errors. Not checked: the Upgrade plan link with a real sandbox subscription, and real Resend delivery.

## Phase 4: Accept-invite landing page

**Goal:** An invitee joins from the emailed link, whether or not they have an account.

**Files:**
- `Sinwy.WebFrontend/src/routes.ts` (mount `/invite` before the `/$organizationSlug` storefront)
- New `Sinwy.WebFrontend/src/modules/invite/routes/$invitationId.tsx` and `modules/invite/lib/` preview query, shaped like `storefrontQuery` in `modules/storefront/lib/storefront-queries.ts` (`api` from `#/shared/lib/api`; 404 → unavailable)
- `Sinwy.Shared/types/organization/Invitation.ts` (`InvitationPreviewDto`), `Sinwy.Shared/types/access/OrgRole.ts` (`ORG_ROLE_LABELS`)
- `Sinwy.WebFrontend/src/modules/auth/lib/useRegister.ts` (takes `source`, derives `callbackURL` around line 45; add a safe `redirect` like `useLogin.ts`) and `modules/auth/routes/register.tsx`; tests next to `modules/auth/tests/register-schema.test.ts`
- `Sinwy.WebFrontend/src/modules/auth/routes/login.tsx`, `modules/auth/lib/useLogin.ts` (already take `redirect`)
- `Sinwy.WebFrontend/src/shared/lib/organizations.ts` (`invalidateOrganizations` after accepting)
- `Sinwy.WebFrontend/src/shared/lib/auth/sign-out.ts`, `auth-error.ts` (`authErrorMessage`)

**Steps:**
- The page loads the Phase 2 preview, then branches:
  - signed out → org, inviter and role, with "Sign in" and "Create account" both carrying `redirect=/invite/<id>`;
  - signed in with the invited email → Accept and Decline;
  - signed in with another email → "This invite is for <email>" and a sign-out button;
  - expired or unavailable → a plain "no longer valid" message.
- Register's `redirect` becomes the verification `callbackURL`, so verifying lands back on the invite page.
- Accept → `acceptInvitation`, invalidate organizations and member queries, go to `/dashboard/<slug>`. Decline → `rejectInvitation`, go to `/auth/postlogin`.
- Seat-full on accept shows its own message, not a generic error.

**Tests that matter:**
- Register's redirect only accepts safe relative paths (same rule as login).
- Accepting with a mismatched email never calls the endpoint.

**Done when:**
- Both an existing user and a brand-new user can go from the email link to the org dashboard, and `bun run verify` exits 0.

**Verify:** Seed `subscribed-org` and a separate `user`. As the owner, invite the seeded user's email and a fresh address. (1) Open the first link signed out → sign in as that user → back on the invite → Accept → org dashboard; a `member` row with role `staff`, invitation `accepted`. (2) Open the second link signed out → Create account with the fresh address → verification email in the outbox → follow it → back on the invite → Accept → dashboard. (3) Open a link while signed in as someone else → mismatch message. (4) Revoke an invite and open its link → no longer valid. Email delivery is the local outbox.

### Log (2026-11-10, `feat(web): add the accept-invite landing page`)
- Shipped: `/invite/<invitationId>` (`modules/invite/routes/$invitationId.tsx`, `ssr: false`) loads the public preview fresh and shows one of: no longer valid (expired, or the 404), signed out (Sign in / Create account carrying `redirect=/invite/<id>`), mismatch ("This invite is for …, but you're signed in as …" with a Sign out that stays on the page via `useSignOut({ stay: true })`), or Accept / Decline. Accept invalidates organizations and the new org's `memberAccessQuery` then opens `/dashboard/<slug>`; Decline → `/auth/postlogin`. `ORGANIZATION_MEMBERSHIP_LIMIT_REACHED` on accept shows "<Org> has no free seats right now…". `modules/invite/lib/invite.ts` holds the preview query, `inviteView` and `acceptInvite` (refuses without calling the endpoint unless the session email matches, case-insensitively). Register takes `?redirect=`, which becomes the verification and Google `callbackURL` (`registerCallbackURL`); login and register share `safeRedirect` (also refuses `/\…`); the login ↔ register cross-links keep the redirect. Tests: `modules/invite/tests/invite.test.ts`, `modules/auth/tests/safe-redirect.test.ts`.
- Differs from plan: no `Sinwy.Shared` change was needed (DTO and labels already existed). `useLogin` lost its inline redirect check in favour of `safeRedirect`. The running vite didn't pick up the new `physical("/invite", …)` mount and kept rewriting `routeTree.gen.ts` without it; restarting the web server fixed it.
- Checked in the running app (e2e subagent, seeded Starter `subscribed-org` and a `user`): (3) the owner on the user's link sees the mismatch text, Sign out stays on the invite signed out; (1) Sign in → `/auth/login?redirect=…` → back on the invite → Accept → `/dashboard/<slug>`, `member` role `staff`, invitation `accepted`, session's active org set, the spent link then shows no longer valid; (4) a revoked invite shows no longer valid signed in or out; (2) Create account with a fresh address → verification email with `callbackURL=/invite/<id>` → lands on the invite signed in → Accept → dashboard, `email_verified` and a `staff` member row. No backend or web log errors. One console 401 on `/api/user/flags` right after Sign out (`queryClient.clear()` refetches `usePostLoginFlags` before `useSession` catches up; no visible effect, likely predates this phase). Not checked: Decline, an expired invite, real Resend delivery, opening the verify link in another browser. Register doesn't prefill the invited email (left out as beyond MVP).

## Phase 5: Role check across the dashboard

**Goal:** Every dashboard page and action behaves right for owner, admin and staff, now that real non-owner members exist.

**Files:**
- `Sinwy.Shared/types/access/RolePermissions.ts` (`ROLE_PERMISSIONS`, the source of truth)
- `Sinwy.WebFrontend/src/modules/org-dashboard/lib/sections.ts` (`ORG_SECTIONS`, `filterNav`)
- `Sinwy.WebFrontend/src/modules/org-dashboard/routes/` (every `_shell.*.tsx`: analytics, bookings, customers, pages, payments, services, settings, team; `_shell.tsx` loads `member`)
- `Sinwy.WebFrontend/src/shared/lib/auth/protected-route.ts` (`requirePermission`, `requireMember`) and `permissions.ts` (`memberAccessQuery`, `usePermissions` for in-page buttons)
- `Sinwy.Backend/modules/{analytics,bookings,organizations,payments,pages,services,transfers}/routes.ts` (each `requirePermission`)
- `docs/org-rules-map.md` section 2

**Steps:**
- Research first: for each role, list every page, sidebar entry and write action, and the expected outcome from `ROLE_PERMISSIONS`.
- Check each in the browser and against the API; fix only mismatches (a visible button the API refuses, a reachable page the role shouldn't see, a missing guard).
- Billing stays owner-only and outside the org (org-rules-map section 2, D15).

**Tests that matter:**
- Any guard added or fixed gets a test at the layer it was fixed in.

**Done when:**
- A role × page table with no unexplained mismatch is in the log entry, and `bun run verify` exits 0.

**Verify:** Seed `org-with-staff --staff 2` (Starter), then as the owner promote one staff to admin from Team. Log in as each of owner, admin and staff; visit every sidebar entry and try typing each gated URL directly. Staff: bookings and customers only, services and pages read-only, no Team, Settings, Payments or Analytics. Admin: everything but billing. Nothing simulated beyond the seeded plan.

### Log (2026-11-10, `docs: record the per-role dashboard check`)
- Shipped: no code change. Read through `ROLE_PERMISSIONS`, `ORG_SECTIONS`/`filterNav`, every `_shell.*.tsx` guard and in-page `canWrite`/`readOnly`, and every org-scoped backend route's `requirePermission`; all agree. The past-due flag and the plan name in `OrganizationSummary` are already scoped by role on the server (`listOrganizations`). Customers has no API (static placeholder page).
- Differs from plan: no mismatch was found, so no guard was added and no test written.
- Checked in the running app (e2e subagent, seeded Starter `org-with-staff --staff 2`, staff1 promoted to admin from Team): role × page table below, with every gated URL typed directly and the matching API called with each role's session. Gated URLs typed by staff redirect to the overview with "You don't have access to that page". No visible button is refused by the API, and no console or web-log errors appeared. Not checked: the owner's Mark as paid (no pending payment during the owner's pass; checked as admin), the owner's billing page against a real Polar subscription (the seeded one isn't in Polar).

| Page / action / API | Owner | Admin | Staff |
| --- | --- | --- | --- |
| Sidebar | all | all | Overview, Bookings, Services, Customers, Pages |
| Overview, Customers | ✓ | ✓ | ✓ |
| Bookings, New booking, booking edits | ✓ | ✓ | ✓ |
| Services list: New service, row actions | ✓ | ✓ | read-only (no buttons) |
| `services/new` | ✓ | ✓ | redirect + notice |
| Service form, `services/hours` | editable | editable | disabled, no Save / closures |
| Pages list: New page | ✓ (+ Upgrade plan at limit) | ✓ (+ "Ask an owner to upgrade.") | none |
| `pages/new` | ✓ | ✓ (limit notice at 1/1) | redirect + notice |
| Page detail: Save, Delete | ✓ | ✓ | Preview only, controls disabled |
| Payments, Mark as paid | ✓ | ✓ | redirect + notice |
| Analytics | ✓ | ✓ | redirect + notice |
| Team (invite, role, remove) | ✓ | ✓ (no actions on owner or self) | redirect + notice |
| Settings: Manage billing, Transfer | ✓ | plan line only | redirect + notice |
| `/account/billing` | org's plan | own picker only | own picker only |
| API: GET payments / analytics | 200 | 200 | 403 |
| API: POST services / pages, PUT profile `{}` | 400 | 400 | 403 |
| API: GET transfer | 200 | 403 | 403 |
| API: invite-member | – | 403 `SEAT_LIMIT_REACHED` | 403 not allowed |

## Phase 6: Code review, docs and cleanup

**Goal:** The auth-facing changes are reviewed, the docs match the code, and the workspace is clean.

**Files:**
- Every file changed in Phases 1–4 (`git diff master...team-invites`; Phase 5 changed no code). Auth-heavy ones: `Sinwy.Backend/modules/auth/auth.ts` (organization hooks, rate limit), `modules/organizations/service.ts` (`getSeatUsage`, `getInvitationPreview`), `modules/auth/emails/invitationEmail.ts`, `Sinwy.WebFrontend/src/modules/invite/`, `modules/auth/lib/safe-redirect.ts`, `modules/org-dashboard/components/team/`
- `docs/org-rules-map.md`, `.agents/skills/e2e-test/references/seed-scenario.md`, this plan and its log

**Steps:**
- Review for auth holes: seat bypasses (concurrent invites, resend, accept after downgrade), role escalation, the public preview leaking anything, unescaped email content, open redirects through `redirect`.
- Fix confirmed findings with tests.
- Make sure the org-rules-map has no "no screen yet" left for invitations, removal or role change, and lists any new gaps.
- Final step: stop every dev server started during this plan's work unless the user asked to keep it running, and delete temporary files (probe scripts, screenshots, browser console logs, scratch data).

**Tests that matter:**
- One per confirmed review finding.

**Done when:**
- Review findings are fixed or written down as known gaps, `bun run verify` exits 0, and no stray processes or files remain.

**Verify:** None.

### Log (2026-11-10, `fix(backend, web): close the concurrent-invite seat bypass and hide the team from staff`)
- Shipped, finding 1 (seat bypass): invites sent at the same moment each passed the seat check before any was stored; six at once on a Starter org with two free seats stored five. `afterCreateInvitation` now counts again and `withdrawInvitationOverCap` (organizations module) deletes the new invitation when the cap is passed, answering 403 `SEAT_LIMIT_REACHED`. It can refuse more than needed in a race, never fewer. Test: "invites sent at the same moment can't pass the seat cap".
- Shipped, finding 2 (team readable by staff): the plugin's `list-invitations`, `list-members` and `get-full-organization` gave any member every invitation (id, email, role) and every member's email, though Team is `people:manage` only; Phase 5 hadn't called them as staff. The two lists now answer 403 without `people:manage`, and `get-full-organization` (the dashboard shell preloads with it for every role) returns empty `members` and `invitations`. Tests: "staff can't read the invitations or the member list", "an admin reads the invitations and the member list".
- Shipped, hardening: `safeRedirect` let `/<tab>/evil.example` through (browsers drop the tab, leaving `//evil.example`). Not exploitable, because every sink goes through Better Auth, which answered 403 `INVALID_CALLBACK_URL` on the running backend; the filter now resolves the path as a URL and compares origins. Test cases added to `safe-redirect.test.ts`.
- Reviewed with no finding: resend (extends the same row, ignores the body's role, takes no seat); accept after a downgrade (`membershipLimit` counts members); role escalation (staff have no `member:update` or `invitation:create`; nobody sets or changes owner; role lists refused); the public preview (only Default 5's fields, one 404 for the rest, ids are the plugin's 32 random characters); the email (every value escaped, subject is plain text); accepting with an unverified email (no session exists before verification).
- Docs: `docs/org-rules-map.md` no longer says accepting has no screen, describes the invite page, the team-read rule and the same-moment rule, and lists the new gaps (section 15): a withdrawn invite's email is already sent, accepting isn't locked, an inactive organization's invite still previews as pending, Revoke has no confirmation, register doesn't prefill the invited email, plus the two gaps Phase 5 found outside invites. `seed-scenario.md` no longer says there is no invite flow.
- Differs from plan: the two dev servers (backend :3001, web :3000) are still running and their logs (`/tmp/sinwy-server.log`, `/tmp/sinwy-web.log`) are still there, because stopping processes was refused by the permission system. Not written down in the rules map: the console 401 on `/api/user/flags` right after sign-out (`useSignOut` clears queries before `useSession` updates), which is a frontend bug, not an organization rule.
- Checked in the running app: only the `callbackURL` refusals, by API. The fixes are covered by tests over HTTP; the staff dashboard wasn't reopened in the browser after `get-full-organization` changed (the frontend reads only the organization's own fields from it). Deleted the six `dev:login-as` storage states made today; older ones in `.playwright-cli/auth/` and `/tmp/sinwy-logs`, `/tmp/sinwy-shots`, `/tmp/sinwy-payments.png` predate this plan and were left. Seeded dev-database rows were left.
