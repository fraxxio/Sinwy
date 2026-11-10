# Team invites plan

Makes organization employees real: owners and admins invite people by email, the invitee accepts (with or without an account), and the team page lists members and pending invites with role change, removal, resend and revoke. Seats are capped per plan. Built on Better Auth's organization plugin, which already owns the invitation and member tables and their endpoints.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [team-invites-log.md](team-invites-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Seats, invite roles and the invitation email | – | done | `feat(backend, shared): cap organization seats per plan and email invitations` |
| 2 | Public invitation preview | 1 | done | `feat(backend, shared): add a public invitation preview` |
| 3 | Team page | 1 | done | `feat(backend, shared, web): add the team page with invites, role changes and removal` |
| 4 | Accept-invite landing page | 2 | todo | |
| 5 | Role check across the dashboard | 3, 4 | todo | |
| 6 | Code review, docs and cleanup | 5 | todo | |

## Decisions

Settled with the product owner. Ask before changing any of them.

- **Seats per plan: Starter 3, Professional 10, Enterprise 25.** A numeric cap in `PLAN_LIMITS` (`members`), not a `requireFeature` flag; no plan (inactive org) → 0.
- **What takes a seat: members (owner included) plus pending, unexpired invitations.** An invite is refused when no seat is free, so accepting never fails for a full org under normal use.
- **New invitee: sign up, verify the email, then accept.** No auth shortcut; the verification link returns them to the invite page.
- **Over the limit after a downgrade: keep every member, block new invites** until the org is back under the cap. Nobody loses access.
- **MVP scope only.** Foundation to build on; no edge-case features beyond what's listed here.

### Defaults (not yet confirmed; change only if asked)

1. Invitations expire after 7 days (`invitationExpiresIn`); resend extends the same invitation, it doesn't create a new one.
2. Invite and role-change roles are exactly one of `admin` or `staff`; `member`, `owner` and comma lists are refused.
3. Owner and admins manage the team (`people:manage`); admins may change or remove other admins. Nobody acts on the owner's row or on themselves from the team page (leaving stays a separate action).
4. The invite link is `/invite/<invitationId>`; `invite` is added to the reserved organization slugs.
5. The public preview returns org name and slug, inviter name, role, invited email and a status (`pending`, `expired`, `unavailable`); the unguessable invitation id is the only key.
6. `POST /organization/invite-member` gets a Better Auth custom rate limit (10 per 60 s).
7. A user who signs in without the link sees no pending-invite prompt; the emailed link is the only way in.
8. Account → Organizations shows the actual role (Owner, Admin, Staff) instead of "Member".

## Standing notes

Verified facts and gotchas the remaining phases rely on. Don't check them again. Each phase prunes this list when it finishes.

- Better Auth 1.7.12. Plugin source: `node_modules/better-auth/dist/plugins/organization/routes/crud-invites.mjs` and `crud-members.mjs`.
- Plugin endpoints already live under `/api/auth/organization/*`: `invite-member` (body `resend: true` re-sends and extends an existing pending invite), `cancel-invitation`, `accept-invitation`, `reject-invitation`, `get-invitation`, `list-invitations`, `list-members`, `update-member-role`, `remove-member`, `leave`.
- Invites send `InvitationEmail` linking to `${WEB_APP_URL}/invite/<id>`; the outbox has it under the invitee's address.
- `invite-member` flow: permission check (`invitation:create`, owner and admin only), plugin role-name check, already-member → 400, already-invited (pending, unexpired) without `resend` → 400, then `beforeCreateInvitation` (role rule, scheduled org, seats). The `resend` path returns before the hook, so it never consumes a seat; an expired invite isn't "pending" to the plugin, so re-inviting creates a new one.
- Seat errors: invite at the cap → 403 `code: "SEAT_LIMIT_REACHED"` (`AUTH_ERROR_CODES`); accept at the cap → 403 `ORGANIZATION_MEMBERSHIP_LIMIT_REACHED`. Bad role → 400 "Choose admin or staff". `INVITE_ROLES`, `isInviteRole` and `INVITATION_EXPIRY_DAYS` are in `@sinwy/shared`; the organizations module exports `getSeatUsage(orgId)` → `{ used, limit }`.
- Public preview: `GET /api/public/invitations/:id`, no session. 200 → `InvitationPreviewDto` (`invitationPreviewSchema` in `@sinwy/shared`, status `pending` | `expired`); every other case is the same 404, which the page treats as `unavailable`. Frontend calls it like `storefrontQuery` (`api<T>("/public/…")`, `res.code === 404`).
- `accept-invitation` needs a session whose email matches the invitation (case-insensitive), sets the session's active organization, and calls `beforeAcceptInvitation`. `get-invitation` also requires the recipient's session, so the page uses the public preview instead.
- Existing hooks in `Sinwy.Backend/modules/auth/auth.ts` (`organizationHooks`): `refuseOwnerRole` on create/accept invitation and role update, `refuseScheduledOrganization` on create/accept, `cancelTransfersToMember` after remove. "Cannot remove the last owner" is already true: one owner, the plugin won't remove or demote the only owner, the owner can't leave.
- `Sinwy.Backend/modules/auth/activeOrganization.ts` `refuseOrganizationEndpoint` already refuses invite, cancel, remove and role change on an inactive org, and every endpoint on a scheduled one.
- Gating is already enforcing: backend routes use `requirePermission`; frontend routes use `requirePermission` in `beforeLoad` and `filterNav` over `ORG_SECTIONS` (`Sinwy.WebFrontend/src/modules/org-dashboard/lib/sections.ts`). Phase 5 only verifies it per role.
- Tests: `Sinwy.Backend/test/helpers.ts` has `createUserWithSession`, `insertOrganization`, `activateOrganization`, `givePlan`, `joinOrganization`; `readOutboxEmails` from `@backend/infrastructure/email` reads sent mail. `Sinwy.Backend/modules/auth/tests/singleOwner.test.ts` shows how to call plugin endpoints over HTTP.
- The `org-with-staff` seed adds staff through `addMember`, capped by seats: Starter allows `--staff 2` at most.
- Frontend: `authClient.organization.*` is typed with `ac` and `orgAccessRoles` (`Sinwy.WebFrontend/src/shared/lib/auth/auth-client.ts`). Login takes `?redirect=` (`useLogin`, safe-relative check); register only takes `?source=` (`useRegister` derives `callbackURL`).
- `OrganizationSummary.role` is the caller's most privileged role (`primaryRole`); `ORG_ROLE_LABELS` (Owner, Admin, Staff) are in `@sinwy/shared`. Use them for the invite page's role text.
- Team data lives in `Sinwy.WebFrontend/src/modules/org-dashboard/lib/team-queries.ts` (`membersQuery`, `invitationsQuery`, `invalidateTeam`, plugin calls unwrapped through `authErrorMessage`); seat maths in `lib/team.ts`. Keys are `["team", orgId, …]`; `organizationsQuery`'s key is `["organizations", "list"]`, not a prefix of `memberAccessQuery`'s.
- Browser checks: the Base UI select animates (pick the option once `[role=listbox]` is there), the first click right after `goto` can land before hydration, and `page.ts` lists toasts as `Dialog:` (they carry `role="dialog"`).
- Frontend top-level routes are mounted in `Sinwy.WebFrontend/src/routes.ts`; any new prefix goes before the `/$organizationSlug` storefront mount.

---

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

---

## Phase 5: Role check across the dashboard

**Goal:** Every dashboard page and action behaves right for owner, admin and staff, now that real non-owner members exist.

**Files:**
- `Sinwy.WebFrontend/src/modules/org-dashboard/lib/sections.ts` (`ORG_SECTIONS`)
- `Sinwy.WebFrontend/src/modules/org-dashboard/routes/` (every `_shell.*.tsx`)
- `Sinwy.Shared/types/access/RolePermissions.ts` (`ROLE_PERMISSIONS`, the source of truth)
- `Sinwy.Backend/modules/*/routes.ts` (each module's `requirePermission`)
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

---

## Phase 6: Code review, docs and cleanup

**Goal:** The auth-facing changes are reviewed, the docs match the code, and the workspace is clean.

**Files:**
- Every file changed in Phases 1–5 (`git diff master...team-invites`)
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
