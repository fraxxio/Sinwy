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
