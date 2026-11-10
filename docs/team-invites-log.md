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
