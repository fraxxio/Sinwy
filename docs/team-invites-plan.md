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
| 5 | Role check across the dashboard | 3, 4 | done | `docs: record the per-role dashboard check` |
| 6 | Code review, docs and cleanup | 5 | done | `fix(backend, web): close the concurrent-invite seat bypass and hide the team from staff` |

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

Every phase is done. What later work on invites should know; detail is in the log.

- Better Auth 1.7.12. Plugin source: `node_modules/better-auth/dist/plugins/organization/routes/crud-invites.mjs` and `crud-members.mjs`. The plugin checks membership only on its reads, and runs no transaction around its hooks.
- `invite-member` flow: permission check, plugin role-name check, already-member → 400, already-invited without `resend` → 400, `beforeCreateInvitation` (role rule, scheduled org, seats), insert, email, `afterCreateInvitation` (seats counted again; over the cap the new row is deleted and the request gets 403 `SEAT_LIMIT_REACHED`). The `resend` path returns before both hooks.
- Team reads are `people:manage` only: `refuseOrganizationEndpoint` (`Sinwy.Backend/modules/auth/activeOrganization.ts`) refuses `list-members` and `list-invitations` for staff, and the `after` hook in `auth.ts` empties `members` and `invitations` in `get-full-organization` for them. Anything staff-facing that needs teammates needs its own endpoint.
- Seat errors: invite at the cap → 403 `SEAT_LIMIT_REACHED`; accept at the cap → 403 `ORGANIZATION_MEMBERSHIP_LIMIT_REACHED`. Accepting isn't locked (known gap, `docs/org-rules-map.md` section 15, with the other open gaps).
- Redirects: `safeRedirect` (`Sinwy.WebFrontend/src/modules/auth/lib/safe-redirect.ts`) resolves the path like a browser would; Better Auth also refuses an unsafe `callbackURL` with 403 `INVALID_CALLBACK_URL`.
- Tests: `Sinwy.Backend/modules/auth/tests/invitations.test.ts` calls the plugin endpoints over HTTP (`post`, `get`, `invite`, `addStaff`).
- Frontend top-level routes are mounted in `Sinwy.WebFrontend/src/routes.ts`; a running vite ignores changes to that file (log Phase 4).
