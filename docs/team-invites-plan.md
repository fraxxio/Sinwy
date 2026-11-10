# Team invites plan

Makes organization employees real: owners and admins invite people by email, the invitee accepts (with or without an account), and the team page lists members and pending invites with role change, removal, resend and revoke. Seats are capped per plan. Built on Better Auth's organization plugin, which already owns the invitation and member tables and their endpoints.

Run a phase with the `implementation-phase` skill. Finished phases and their logs are in [team-invites-log.md](team-invites-log.md).

## Status

| Phase | Title | Depends on | Status | Commit |
| --- | --- | --- | --- | --- |
| 1 | Seats, invite roles and the invitation email | – | done | `feat(backend, shared): cap organization seats per plan and email invitations` |
| 2 | Public invitation preview | 1 | done | `feat(backend, shared): add a public invitation preview` |
| 3 | Team page | 1 | done | `feat(backend, shared, web): add the team page with invites, role changes and removal` |
| 4 | Accept-invite landing page | 2 | done | `feat(web): add the accept-invite landing page` |
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
- Public preview: `GET /api/public/invitations/:id`, no session. 200 → `InvitationPreviewDto` (status `pending` | `expired`); every other case is the same 404. The invite page is `Sinwy.WebFrontend/src/modules/invite/` (`inviteView`, `acceptInvite` with the email check, log Phase 4).
- `accept-invitation` needs a session whose email matches the invitation (case-insensitive), sets the session's active organization, and calls `beforeAcceptInvitation`.
- Existing hooks in `Sinwy.Backend/modules/auth/auth.ts` (`organizationHooks`): `refuseOwnerRole` on create/accept invitation and role update, `refuseScheduledOrganization` on create/accept, `cancelTransfersToMember` after remove. "Cannot remove the last owner" is already true: one owner, the plugin won't remove or demote the only owner, the owner can't leave.
- `Sinwy.Backend/modules/auth/activeOrganization.ts` `refuseOrganizationEndpoint` already refuses invite, cancel, remove and role change on an inactive org, and every endpoint on a scheduled one.
- Gating is already enforcing: backend routes use `requirePermission`; frontend routes use `requirePermission` in `beforeLoad` and `filterNav` over `ORG_SECTIONS` (`Sinwy.WebFrontend/src/modules/org-dashboard/lib/sections.ts`). Phase 5 only verifies it per role.
- Tests: `Sinwy.Backend/test/helpers.ts` has `createUserWithSession`, `insertOrganization`, `activateOrganization`, `givePlan`, `joinOrganization`; `readOutboxEmails` from `@backend/infrastructure/email` reads sent mail. `Sinwy.Backend/modules/auth/tests/singleOwner.test.ts` shows how to call plugin endpoints over HTTP.
- The `org-with-staff` seed adds staff through `addMember`, capped by seats: Starter allows `--staff 2` at most.
- Frontend: `authClient.organization.*` is typed with `ac` and `orgAccessRoles` (`Sinwy.WebFrontend/src/shared/lib/auth/auth-client.ts`). Login and register both take `?redirect=`, filtered by `modules/auth/lib/safe-redirect.ts`; on register it becomes the verification `callbackURL`.
- `OrganizationSummary.role` is the caller's most privileged role (`primaryRole`); `ORG_ROLE_LABELS` (Owner, Admin, Staff) are in `@sinwy/shared`.
- Team data lives in `Sinwy.WebFrontend/src/modules/org-dashboard/lib/team-queries.ts` (`membersQuery`, `invitationsQuery`, `invalidateTeam`, plugin calls unwrapped through `authErrorMessage`); seat maths in `lib/team.ts`. Keys are `["team", orgId, …]`; `organizationsQuery`'s key is `["organizations", "list"]`, not a prefix of `memberAccessQuery`'s.
- Browser checks: the Base UI select animates (pick the option once `[role=listbox]` is there), the first click right after `goto` can land before hydration, and `page.ts` lists toasts as `Dialog:` (they carry `role="dialog"`).
- Frontend top-level routes are mounted in `Sinwy.WebFrontend/src/routes.ts`; any new prefix goes before the `/$organizationSlug` storefront mount. A running vite ignores changes to that file and overwrites `routeTree.gen.ts` without them: restart `bun run start:web` (log Phase 4).
- Known gaps for Phase 6: one console 401 on `/api/user/flags` right after sign-out (`useSignOut` clears queries before `useSession` updates); Revoke has no confirmation; register doesn't prefill the invited email.

---

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
