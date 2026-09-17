# Account Management — Implementation Plan (issue #30)

Goal: one `/account/settings` page, reachable from both sidebars' user menu,
where a user manages profile, email, password, sessions, connected accounts
and account deletion. Everything Better Auth already ships is used as-is
through `/api/auth/*`; the backend adds only what Better Auth refuses to do
from the client (set password, avatar upload, owned-org cascade).

Done when: a Google-only user can set a password, unlink Google, change
email with re-verification, upload an avatar, revoke another device, and
delete the account — with any sole-owned organization removed and its Polar
subscription revoked — all from the settings page, in both dashboards.

## Status

| Phase | State |
| --- | --- |
| 1 — Shared | Done |
| 2 — Backend: Better Auth config + emails | Done |
| 3 — Backend: owned-org cascade on delete | Done |
| 4 — Backend: user module endpoints + storage | Open |
| 5 — Frontend: settings page + NavUser | Open |
| 6 — End-to-end check and docs | Open |

## Decisions (already made, do not re-open)

| Topic | Decision |
| --- | --- |
| Owned orgs on delete | **Cascade sole-owned.** Organizations where the user is the only `owner` are deleted (FK cascades members, invitations, profile) and their active Polar subscription is revoked first. Organizations with another owner just lose the membership row. Any Polar revoke failure aborts the whole deletion. |
| Delete confirmation | Always by email (`sendDeleteAccountVerification`), never by password. Uniform for password and Google-only users; the link deletes and redirects to `/auth/goodbye`. |
| Change email | Two-step: confirmation to the **current** address (`sendChangeEmailConfirmation`), then Better Auth's verification to the **new** address. Email is only swapped after the second click. |
| Set password | Server-only per Better Auth; exposed as `POST /api/user/password`. Only for users without a `credential` account — Better Auth rejects otherwise, we surface that as 409. |
| Unlink Google | Better Auth default (`allowUnlinkingAll: false`) stays. UI disables "Unlink" until a password exists. |
| Change password | `revokeOtherSessions: true`, always. Matches `revokeSessionsOnPasswordReset`. |
| Profile fields | `name` and `image` only (Better Auth core). Timezone and locale are deferred to the features that read them (bookings, i18n); no schema change in this ticket. `name` is validated in `databaseHooks.user.update.before` since Better Auth checks types only. |
| Avatar storage | New `infrastructure/storage/` mirroring the email client: a `StorageClient` contract keyed by object key, drivers picked by `STORAGE_DRIVER`. Only the `local` driver (files under `Sinwy.Backend/.storage/`) ships now; a provider driver (S3/R2/… via Bun's native `S3Client`) is one added file later. |
| Avatar URLs | Always ours: `${BETTER_AUTH_URL}/api/files/<key>`, never a provider URL. `GET /api/files/*` delegates to `storageClient.serve(key)`, so switching provider later needs no data migration and no frontend change. |
| Avatar limits | PNG/JPEG/WebP, ≤ 2 MB, magic-byte checked. Key `avatars/<userId>/<random>.<ext>`; the previous object is deleted on replace/remove. |
| Session refresh after server-side user writes | Frontend calls `authClient.$store.notify("$sessionSignal")` so `useSession` refetches; no cookie cache is configured so nothing else can go stale. |
| Polar customer | Deleted best-effort in `afterDelete` via `customers.deleteExternal`; failure is logged, never surfaced. |
| NavUser | Keeps session + sign-out wiring it already has. Placeholder items are replaced: `Account settings` → `/account/settings`, `Notifications` → `/account/notifications`, theme toggle, log out. "Upgrade to Pro" and "Billing" go (billing is per-organization). |

## Existing code you will touch

- Shared: [Sinwy.Shared/types/user/index.ts](../Sinwy.Shared/types/user/index.ts), [Sinwy.Shared/types/auth/Auth.ts](../Sinwy.Shared/types/auth/Auth.ts)
- Backend: [modules/auth/auth.ts](../Sinwy.Backend/modules/auth/auth.ts), [modules/auth/index.ts](../Sinwy.Backend/modules/auth/index.ts), [modules/user/routes.ts](../Sinwy.Backend/modules/user/routes.ts), [modules/user/controller.ts](../Sinwy.Backend/modules/user/controller.ts), [modules/user/service.ts](../Sinwy.Backend/modules/user/service.ts), [modules/user/repository.ts](../Sinwy.Backend/modules/user/repository.ts), [modules/organizations/index.ts](../Sinwy.Backend/modules/organizations/index.ts), [modules/organizations/service.ts](../Sinwy.Backend/modules/organizations/service.ts), [modules/organizations/repository.ts](../Sinwy.Backend/modules/organizations/repository.ts), [lib/appConfig.ts](../Sinwy.Backend/lib/appConfig.ts), [index.ts](../Sinwy.Backend/index.ts), [test/helpers.ts](../Sinwy.Backend/test/helpers.ts)
- Frontend: [shared/components/shell/NavUser.tsx](../Sinwy.WebFrontend/src/shared/components/shell/NavUser.tsx), [modules/account-dashboard/routes/_shell.settings.tsx](../Sinwy.WebFrontend/src/modules/account-dashboard/routes/_shell.settings.tsx), [modules/auth/lib/useRegister.ts](../Sinwy.WebFrontend/src/modules/auth/lib/useRegister.ts), [modules/auth/lib/useResetPassword.ts](../Sinwy.WebFrontend/src/modules/auth/lib/useResetPassword.ts)

Rules that apply throughout (from CLAUDE.md): Bun only, Biome formatting
(tabs, double quotes), Zod for validation with inferred DTO types, plain
functions, cross-module imports only through a module's `index.ts`, never
touch another module's repository, `shared/` never imports from `modules/`,
Drizzle types stay internal (map to DTOs), no session-specific comments.

---

## Phase 1 — Shared

### 1.1 Move the password rules

`passwordSchema` and `PASSWORD_RULES` leave
`Sinwy.WebFrontend/src/modules/auth/lib/useRegister.ts` for
`Sinwy.Shared/types/auth/Password.ts` (re-exported from `types/auth/index.ts`).
The backend needs the same rule for `POST /api/user/password`. Update the two
frontend imports (`useRegister.ts`, `useResetPassword.ts`,
`ResetPasswordForm.tsx`).

### 1.2 `types/user/AccountSettings.ts`

```ts
export const PROFILE_LIMITS = { name: 100 } as const;

export const profileSchema = z.object({
	name: z.string().trim().min(1).max(PROFILE_LIMITS.name),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const AVATAR_LIMITS = {
	maxBytes: 2 * 1024 * 1024,
	mimeTypes: ["image/png", "image/jpeg", "image/webp"],
} as const;

export type AvatarDto = { image: string };

export type AccountDeletionPreviewDto = {
	soleOwnedOrganizations: { id: string; name: string; status: OrganizationStatus }[];
};

export const setPasswordSchema = z.object({ newPassword: passwordSchema });
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
```

The legacy `types/user/User.ts` (`id: number`) is unused — delete it.

---

## Phase 2 — Backend: Better Auth config, emails

No schema change: `name` and `image` are Better Auth core columns that
already exist.

### 2.1 `modules/auth/auth.ts`

```ts
user: {
	changeEmail: {
		enabled: true,
		sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
			await emailClient.send({ to: user.email, template: ChangeEmailConfirmationEmail, props: { newEmail, confirmUrl: url } });
		},
	},
	deleteUser: {
		enabled: true,
		sendDeleteAccountVerification: async ({ user, url }) => {
			await emailClient.send({ to: user.email, template: DeleteAccountEmail, props: { deleteUrl: url } });
		},
		beforeDelete: async (user) => {
			// Phase 3: cascade sole-owned organizations, throws APIError on Polar failure
			await deleteSoleOwnedOrganizations(user.id);
		},
		afterDelete: async (user) => {
			// best-effort: Polar customer + stored avatar
		},
	},
},
databaseHooks: {
	user: {
		update: {
			before: async (data) => {
				// Better Auth accepts any string for name; enforce our length rule
				if (data.name !== undefined) {
					const result = profileSchema.safeParse({ name: data.name });
					if (!result.success) throw new APIError("BAD_REQUEST", { message: "Invalid name" });
					return { data: { ...data, name: result.data.name } };
				}
			},
		},
	},
},
```

Rate limit: add `"/change-email": { window: 60, max: 3 }` and
`"/delete-user": { window: 60, max: 3 }` to `rateLimit.customRules` — both
send email.

The existing `emailVerification.sendVerificationEmail` already handles the
second step of change-email (Better Auth calls it with the new address);
nothing to add.

### 2.2 Email templates (`modules/auth/emails/`)

- `changeEmailConfirmationEmail.ts` — `{ newEmail, confirmUrl }`, subject
  "Approve your email change".
- `deleteAccountEmail.ts` — `{ deleteUrl }`, subject "Confirm account
  deletion". Copy states the action is permanent.

Same shape as `ResetPasswordEmail`.

---

## Phase 3 — Backend: owned-org cascade on delete

Lives in the organizations module (it owns the org lifecycle and already
imports `polarClient` from `@authModule`); the auth config only calls the
exported service function.

### 3.1 `modules/organizations/repository.ts`

```ts
/** Organizations where this user is an owner and no other member is. */
export const findSoleOwnedOrganizations = (userId: string) =>
	db.select({ id, name, status }).from(organization)
	  .where(and(
	    exists(member where organizationId = organization.id and userId = ? and memberHasRole("owner")),
	    notExists(member where organizationId = organization.id and userId <> ? and memberHasRole("owner")),
	  ));

export const deleteOrganizations = (ids: string[]) =>
	db.delete(organization).where(inArray(organization.id, ids));
```

### 3.2 `modules/organizations/service.ts`

```ts
export const getAccountDeletionPreview = async (userId): Promise<AccountDeletionPreviewDto>

/**
 * Revokes each sole-owned organization's active Polar subscription, then
 * deletes the rows. A revoke failure throws before anything is deleted so a
 * paying subscription is never orphaned.
 */
export const deleteSoleOwnedOrganizations = async (userId: string) => {
	const orgs = await findSoleOwnedOrganizations(userId);
	for (const org of orgs) await revokeOrganizationSubscription(org.id); // throws APIError("INTERNAL_SERVER_ERROR", ...) on failure
	if (orgs.length) await deleteOrganizations(orgs.map((o) => o.id));
};
```

`revokeOrganizationSubscription` reuses the lookup shape from
`reconcileStatus.ts`: `polarClient.subscriptions.list({ metadata: { referenceId }, active: true, limit: 1 })`
then `subscriptions.revoke({ id })`. Idempotent: no active subscription → no-op.

The `subscription.revoked` webhook will later arrive for an organization that
no longer exists; `projectSubscriptionStatus` already logs "unknown org" and
returns. No change needed.

Export both from `modules/organizations/index.ts`.

### 3.3 Tests — `modules/organizations/tests/accountDeletion.test.ts`

Using `createUserWithSession` + direct inserts:
- user is sole owner → org returned by preview; after `deleteSoleOwnedOrganizations` the org, member and profile rows are gone.
- org with a second owner → not in preview, untouched.
- org where user is `admin` only → not in preview, untouched.
- Polar revoke rejects (mock `polarClient.subscriptions`) → throws, no rows deleted.

---

## Phase 4 — Backend: user module endpoints + storage

### 4.1 Storage infrastructure — `infrastructure/storage/`

Mirrors `infrastructure/email/`: one contract, drivers behind a config switch.
The rest of the backend imports only `storageClient` and speaks in object
keys; it never sees a provider URL or a filesystem path.

```
storage/
├── index.ts                 // export { storageClient, type StorageClient, fileUrl }
├── storageClientTypes.ts    // the contract below
├── storageClient.ts         // switch (appConfig.STORAGE_DRIVER) { case "local": … }
└── localStorageClient.ts    // the only driver in this ticket
```

```ts
// storageClientTypes.ts
export type StorageClient = {
	put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
	delete(key: string): Promise<void>;
	/** Response for GET /api/files/<key>: 404 when missing. */
	serve(key: string): Promise<Response>;
};

/** Canonical public URL for a stored object, independent of the driver. */
export const fileUrl = (key: string) => `${appConfig.BETTER_AUTH_URL}/api/files/${key}`;
export const keyFromFileUrl = (url: string | null | undefined): string | null; // inverse, null for foreign URLs (e.g. a Google avatar)
```

`localStorageClient`: `put` writes `Bun.write(".storage/<key>")`, `delete`
unlinks, `serve` returns `new Response(Bun.file(path))` with a long
`Cache-Control` (keys are random, so caching is safe). Every method resolves
the path under `.storage/` and rejects anything that escapes it.

`lib/appConfig.ts` adds `STORAGE_DRIVER: z.enum(["local"]).default("local")`.
`.storage/` goes in `.gitignore`.

Adding a provider later (S3/R2/MinIO via Bun's built-in `S3Client`, no
dependency): one new `s3StorageClient.ts` whose `serve` returns a `302` to the
bucket's public or presigned URL, its env vars in `appConfig` (required
together when the driver is `s3`, same `ctx.addIssue` pattern as
`RESEND_API_KEY`), and a `case` in `storageClient.ts`. Stored `user.image`
values keep working because they only ever point at `/api/files/<key>`.

### 4.2 Routes — `modules/user/routes.ts`

| Method | Path | Handler | Middleware |
| --- | --- | --- | --- |
| `POST` | `/api/user/password` | `setPasswordHandler` | `requireAuth` |
| `POST` | `/api/user/avatar` | `uploadAvatarHandler` | `requireAuth` |
| `DELETE` | `/api/user/avatar` | `removeAvatarHandler` | `requireAuth` |
| `GET` | `/api/user/deletion-preview` | `getDeletionPreviewHandler` | `requireAuth` |
| `GET` | `/api/files/*` | `serveFileHandler` → `storageClient.serve(key)` | — |

### 4.3 Service — `modules/user/service.ts`

```ts
export const setPassword = async (headers: Headers, input: SetPasswordInput) =>
	// Better Auth throws when a credential account exists → controller maps to 409
	auth.api.setPassword({ body: input, headers });

export const uploadAvatar = async (headers: Headers, user: SessionUser, file: File): Promise<AvatarDto> => {
	const bytes = await validateAvatar(file);            // size, mime allowlist, magic bytes → throws AvatarError
	const key = `avatars/${user.id}/${crypto.randomUUID()}.${ext}`;
	await storageClient.put(key, bytes, file.type);
	const image = fileUrl(key);
	await auth.api.updateUser({ body: { image }, headers });
	await deleteStoredAvatar(user.image);               // keyFromFileUrl → null for foreign URLs → skip
	return { image };
};

export const removeAvatar = async (headers, user) => { updateUser image: null; deleteStoredAvatar(user.image) };

export const getAccountDeletionPreview = (userId) => organizations.getAccountDeletionPreview(userId); // via @organizationsModule
```

`validateAvatar` + `avatarExtension` live in `modules/user/avatar.ts` and are
pure so they can be unit-tested without storage.

### 4.4 Controller

`uploadAvatarHandler` reads `await c.req.formData()`, takes `file`, maps
`AvatarError` → 400 / 413. `setPasswordHandler` parses body with
`setPasswordSchema`, catches Better Auth `APIError` and maps to
`fail(message, 409)` when status is `BAD_REQUEST`.

### 4.5 `afterDelete` cleanup

Exported from the user module as `cleanupDeletedUser(user)`: deletes the
stored avatar and calls `polarClient.customers.deleteExternal({ externalId: user.id })`,
each in its own `try/catch` with a `warn` log.

### 4.6 Tests

- `modules/user/tests/avatar.test.ts` — `validateAvatar`: accepts png/jpeg/webp
  with matching magic bytes; rejects oversize, disallowed mime, mime/magic
  mismatch. `localStorageClient`: round-trip put/serve/delete in a temp dir, path traversal rejected. `keyFromFileUrl`: ours → key, Google URL → null.
- `modules/user/tests/setPassword.test.ts` — Google-only user (account row
  with `providerId: "google"`) → 200 and a `credential` account exists;
  user with password → 409. Uses the forged session cookie from
  `test/helpers.ts`; extend `createUserWithSession` with an optional
  `accounts` seed.
- `modules/user/tests/deletionPreview.test.ts` — reads through the route.

---

## Phase 5 — Frontend

All new files under `Sinwy.WebFrontend/src/modules/account-dashboard/` unless
noted.

### 5.1 UI primitives (shared)

Add via shadcn (base-ui registry, same as existing components):
`alert-dialog`, `dialog`, `badge`. Nothing else is missing.

### 5.2 Queries — `lib/account-queries.ts`

```ts
export const accountKeys = { accounts: ["account","accounts"], sessions: ["account","sessions"], deletionPreview: ["account","deletion-preview"] } as const;
export const accountsQuery = queryOptions({ queryKey, queryFn: () => authClient.listAccounts() → data ?? [] });
export const sessionsQuery = queryOptions({ ..., queryFn: () => authClient.listSessions() → data ?? [] });
export const deletionPreviewQuery = queryOptions({ ..., queryFn: () => api<AccountDeletionPreviewDto>("/user/deletion-preview") });
export const hasCredentialAccount = (accounts) => accounts.some((a) => a.providerId === "credential");
export const refreshSession = () => authClient.$store.notify("$sessionSignal");
```

### 5.3 Route — `routes/_shell.settings.tsx`

Keeps `staticData: { crumb: "Settings" }`. Adds
`validateSearch: z.object({ email: z.literal("changed").optional() })` so the
change-email callback (`callbackURL: "/account/settings?email=changed"`) can
raise a "Email updated" toast. Renders `PageHeader` then the sections below as
stacked `Card`s with `id` anchors.

### 5.4 Sections — `components/settings/`

| File | Behaviour |
| --- | --- |
| `ProfileSection.tsx` | `AvatarUpload` on the left, `useAppForm` with `profileSchema` on the right, defaults from `session.user`. Single `TextField` name. Submit → `authClient.updateUser({ name })`. Same `revalidateLogic({ mode: "change" })` + `serverError` pattern as `BusinessProfileForm`. |
| `AvatarUpload.tsx` | Avatar preview + hidden `<input type="file" accept=…>` + Remove button. Client pre-checks `AVATAR_LIMITS`, posts `FormData` to `/user/avatar` (raw `fetch`, not `api()` which forces JSON content-type — add an `apiUpload` helper in `shared/lib/api.ts` that omits the header), then `refreshSession()`. |
| `EmailSection.tsx` | Shows current email + `Verified` badge. Form with `newEmail` (zod email, must differ). Submit → `authClient.changeEmail({ newEmail, callbackURL })`. Success state: "Check your current inbox to approve, then the new one to verify." |
| `PasswordSection.tsx` | If `hasCredentialAccount`: current + new + confirm, `authClient.changePassword({ ..., revokeOtherSessions: true })`, then `refreshSession()` and toast. Else "Set password" form: new + confirm → `api("/user/password", POST)`, invalidate `accountKeys.accounts`. Reuses `PASSWORD_RULES` for the description. |
| `SessionsSection.tsx` | List from `sessionsQuery`; each row: device (from `describeUserAgent`), IP, created/last active, `Current` badge when `token === session.session.token`. Per-row `authClient.revokeSession({ token })`; header button `authClient.revokeOtherSessions()`. Invalidate `accountKeys.sessions` after each. |
| `ConnectedAccountsSection.tsx` | Google row from `accountsQuery`. Not linked → `authClient.linkSocial({ provider: "google", callbackURL: "/account/settings" })`. Linked → `Unlink` (`authClient.unlinkAccount({ providerId: "google" })`), disabled with tooltip "Set a password first" when it is the only account. |
| `DangerZone.tsx` | Destructive card. `AlertDialog` fetches `deletionPreviewQuery` on open: when `soleOwnedOrganizations.length > 0` lists them by name with the warning that they and their subscriptions are deleted; requires typing the account email to enable Confirm. Confirm → `authClient.deleteUser({ callbackURL: "/auth/goodbye" })` → dialog swaps to "Check your email to confirm". |

### 5.5 `lib/describe-user-agent.ts` (+ `tests/describe-user-agent.test.ts`)

Tiny pure function: browser (Chrome/Safari/Firefox/Edge) + OS
(Windows/macOS/iOS/Android/Linux) → `"Chrome on macOS"`, falling back to
`"Unknown device"`. No UA library.

### 5.6 Goodbye page — `modules/auth/routes/goodbye.tsx`

Public route `/auth/goodbye`. On mount calls `queryClient.clear()` (the
session is gone server-side). Reads `?error=` — Better Auth appends it when
`beforeDelete` throws — and shows either "Your account has been deleted" or
"We couldn't delete your account: …" with a link back to settings.

### 5.7 NavUser — `shared/components/shell/NavUser.tsx`

Replace the placeholder group with `Link`-rendered items:

```tsx
<DropdownMenuItem render={<Link to="/account/settings" />}><BadgeCheckIcon /> Account settings</DropdownMenuItem>
<DropdownMenuItem render={<Link to="/account/notifications" />}><BellIcon /> Notifications</DropdownMenuItem>
<DropdownMenuItem closeOnClick={false} onClick={toggleTheme}>…</DropdownMenuItem>
```

Drop "Upgrade to Pro" and "Billing". Session display and `useSignOut` stay.

### 5.8 Frontend tests

- `tests/profile-schema.test.ts` — name trimmed, empty and over-limit rejected.
- `tests/describe-user-agent.test.ts`.
- Existing `register-schema.test.ts` / `reset-password-schema.test.ts` keep
  passing after the `passwordSchema` move.

---

## Phase 6 — End-to-end check and docs

Manual pass (local driver, console email client):

1. Register with email → `/account/settings`: change name, refresh, value persists and `NavUser` shows it.
2. Upload avatar → sidebar `NavUser` shows it without reload; replace → old file gone from `.storage/`; remove → `image` null.
3. Change email → console shows confirmation link → click → console shows verification link to the new address → click → lands on settings with toast, `email` updated and verified.
4. Change password with a second browser signed in → second browser is logged out.
5. Google sign-up → Password section shows "Set password" → set → Connected accounts now allows Unlink → unlink → sign in with password works.
6. Open a second session → Sessions lists both, current badged → revoke other → gone.
7. Create an org and pay in Polar sandbox → Danger zone lists it → confirm → email → click → `/auth/goodbye`, org row gone, Polar subscription revoked, Polar customer deleted.
8. Same with a co-owner on the org → org survives, only the membership is gone.
9. Both sidebars: user menu → Account settings lands on the same page.

Docs: add an "Account management" section to
[docs/user-flow-map.md](user-flow-map.md) covering the change-email
double-hop and the delete cascade; add `STORAGE_DRIVER` to the backend
`.env.example`.

## Open items (not blocking)

- Object storage provider for production. Until one is chosen the `local`
  driver runs everywhere; on a host with an ephemeral disk uploaded avatars
  would not survive a redeploy, so pick the provider before real users upload.
- Timezone and locale were dropped from this ticket; add them with bookings
  and i18n respectively (column + `user.additionalFields` + form field each).
- Team management (transfer ownership) and org deletion from org settings are
  separate tickets; when they land, the Danger zone should link to them as the
  non-destructive alternative.
