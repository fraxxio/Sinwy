# Task: Resume-Onboarding Affordance (frontend)

Surface a **non-blocking prompt** when a signed-in user has an organization they
created but never paid for, offering to take them back to plan selection.

Backend work is already done and merged into the working tree. This task is
frontend only.

---

## 1. Why an affordance and not a redirect

A user can abandon signup at any point. The account already exists, so on their
next visit they are simply logged in with nothing indicating that an
organization is sitting unpaid.

**Do not force a redirect.** `docs/user-creation-roadmap.md` §3.1 is explicit
that users are never pushed into organization creation, and §6 says Customer
Mode must stay reachable at all times. A hard redirect on app open would break
both. The prompt must be dismissible and must never block navigation.

Note the distinction in `CONTEXT.md`: **Organization Status** (billing) is not
onboarding completion. This prompt is about billing only — see §6.

---

## 2. The endpoint (already built — do not modify)

```
GET /api/user/flags          requires an authenticated session
```

Returns the standard `ApiResponse<T>` envelope:

```jsonc
{ "isSuccess": true, "data": { "unfinishedOnboarding": null }, "message": null, "code": 0 }

// or, when the user owns an unpaid organization:
{ "isSuccess": true,
  "data": { "unfinishedOnboarding": { "step": "select-plan", "organizationId": "abc123" } },
  "message": null, "code": 0 }
```

Types come from `@sinwy/shared`:

```ts
import type { PostLoginFlags, UnfinishedOnboarding } from "@sinwy/shared";
```

Backend source, for reference only: `Sinwy.Backend/modules/user/`.

Semantics already encoded server-side — **do not re-derive any of this on the
client**:

- Only organizations where the user's role is `owner` are considered.
- Only `status = "inactive"` organizations are considered.
- If several qualify, the **oldest** is returned.
- A user with no memberships gets `null` — this is how a plain platform visitor
  is distinguished from a business owner. There is no persisted "user type", and
  you must not add one (`CONTEXT.md`: capabilities derive from memberships).

### Hard constraint

This endpoint is deliberately a **single cached DB read** and must never reach
the Polar API. Reconciling billing state against Polar lives on
`GET /organizations/:id/status`, which runs when the user actually re-enters the
funnel. Do not add billing verification to this path, and do not call
`/organizations/:id/status` just to render the prompt.

---

## 3. Fetching

The query client is **already wired** — `getContext()` in
`src/shared/integrations/tanstack-query/root-provider.tsx` supplies it,
`router.tsx` passes it as router context and calls
`setupRouterSsrQueryIntegration`. Do not re-wire it. (The unused
`TanStackQueryProvider` stub in that file is dead code; leave it alone or remove
it separately.)

Use the existing helper, which prepends `/api` itself:

```ts
import { api } from "#/shared/lib/api";

const res = await api<PostLoginFlags>("/user/flags");
```

Requirements:

- **Only fetch when a session exists.** Gate on `authClient.useSession()` so
  anonymous visitors never fire a guaranteed 401.
- **Browser only.** `api()` uses a relative URL and is browser-only (see the
  `ponytail` comment in `src/shared/lib/api.ts`). Make sure the query cannot run
  during SSR.
- **Long `staleTime`.** These flags change rarely. Fetch roughly once per app
  load, not per navigation. Do not poll.
- `api()` never throws — it returns `isSuccess: false` on network failure.
  Treat any failure as "no flags" and render nothing. **The prompt must never
  surface an error to the user**; it is an optional nicety, not a critical path.

Suggested files (mirroring the backend module name and the existing
`modules/<name>/{components,lib,tests}` layout):

```
src/modules/user/lib/usePostLoginFlags.ts       query hook
src/modules/user/lib/resume-prompt.ts           pure decision logic (see §7)
src/modules/user/components/UnfinishedOnboardingToast.tsx
```

---

## 4. The toast

Use the existing component at `src/shared/components/ui/toast.tsx`. **Do not add
a toast library and do not build a custom modal.**

`<Toaster>` is already mounted in `src/root.tsx` (wrapping `Header`, children and
`Footer`), and its `ToastList` already renders title, description, action button
and close button. You only need to call the manager:

```tsx
import { toast } from "#/shared/components/ui/toast";

toast.add({
	id: "unfinished-onboarding", // re-adding with the same id updates in place
	type: "info",                // renders the InfoIcon
	title: "Finish setting up your organization",
	description: "Pick a plan to activate it.",
	timeout: 0,                  // 0 = never auto-dismiss
	actionProps: {
		children: "Choose a plan",
		onClick: () => navigate({
			to: "/organizations/$id/plan",
			params: { id: organizationId },
		}),
	},
});
```

Verified details of this API (`@base-ui/react` 1.6.0) — rely on them:

- `toast.add(options)` returns the toast id; `toast.close(id)` dismisses it.
- Passing an existing `id` **updates in place** instead of stacking a duplicate.
  Use a stable id so remounts and navigations cannot produce a pile of toasts.
- `timeout: 0` disables auto-dismiss. Anything else and the user may miss it.
- `actionProps` is plain `button` props. The action button **only renders when
  `actionProps.children` is truthy** — omit `actionProps` and no button appears.
- `type` drives the icon; supported values are `success`, `info`, `warning`,
  `error`, `loading`. Use `info`. This is a helpful nudge, **not** an error.
- The close button is always rendered, so dismissal works for free.

---

## 5. When to show it

Show when **all** of these hold:

1. A session exists.
2. `data.unfinishedOnboarding !== null`.
3. The user is **not already inside the onboarding funnel**.

Condition 3 matters — do not nag someone who is already doing the thing.
Suppress on at least:

| Route | Why |
| --- | --- |
| `/organizations/$id/plan` | they are choosing a plan right now |
| `/checkout/success` | payment just went through; that page polls activation |
| `/organizations/new` | mid-creation |
| `/organizations/$id/onboarding` | already in Organization Mode |
| `/auth/*` | mid-authentication |

Fire it **once per app load**, not on every route change. Dismissing it must
keep it dismissed for that session — track that the toast has already been
raised so a later navigation does not re-raise it.

There is a benign race: right after payment the DB may still read `inactive`
for a few seconds until the Polar webhook lands, so the flag can briefly say
`select-plan` for someone who has just paid. Suppressing on `/checkout/success`
(which does its own polling) is what keeps this invisible. Do not add polling
here to compensate.

---

## 6. Scope limit: only `"select-plan"` exists

`OnboardingStep` is currently a single-member union. An **active** organization
returns `null` on purpose: there is no `onboardingCompleted` flag yet — the
onboarding page (`src/modules/organizations/routes/$id.onboarding.tsx`) is a
placeholder. If you invent a "finish setting up your page" step now, every
paying customer gets a permanent nag with nothing to complete.

Handle `"select-plan"`. Write the `switch`/mapping so a second step can be added
later without restructuring, but **do not add speculative steps**.

---

## 7. Testing

Frontend tests here are Bun tests over **pure functions**, not rendered
components — see `src/modules/auth/tests/post-login.test.ts` for the pattern.

Extract the decision into a pure function and test that:

```ts
// src/modules/user/lib/resume-prompt.ts
export function shouldPromptResume(
	flags: PostLoginFlags | null,
	pathname: string,
): UnfinishedOnboarding | null;
```

Cover: null flags → null; unfinished onboarding on `/` → returns it; each
suppressed route from §5 → null; failed fetch (`null` flags) → null.

Run `bun test` in `Sinwy.WebFrontend`.

---

## 8. Cache invalidation

Invalidate the flags query after anything that could change the answer:

- **Organization created** — `src/modules/organizations/routes/new.tsx`, after
  the successful `POST /organizations`.
- **Activation confirmed** — `src/modules/checkout/routes/success.tsx`, once
  `pollUntilActive` resolves true.

Otherwise a stale cached flag can prompt a user who has just paid.

---

## 9. Acceptance criteria

- [ ] Signed-in user with an unpaid owned org sees a persistent, dismissible
      info toast on app load, outside the funnel routes.
- [ ] Its action navigates to `/organizations/$id/plan` for the returned
      `organizationId`.
- [ ] Signed-out visitors trigger **no** request to `/api/user/flags`.
- [ ] Users with no orgs, or with only active orgs, see nothing.
- [ ] Nothing renders on the funnel routes in §5.
- [ ] The toast is raised at most once per app load and never duplicates.
- [ ] A failed or 401 request renders nothing and surfaces no error.
- [ ] Navigation is never blocked or auto-redirected.
- [ ] Flags are invalidated per §8.
- [ ] `bun run check`, `bunx tsc --noEmit` (in `Sinwy.WebFrontend`) and
      `bun test` all pass.

Note: `Sinwy.WebFrontend/components.json` has a pre-existing Biome formatting
error (missing trailing newline). It is unrelated — leave it or fix it in a
separate change, but do not let it block you.

---

## 10. Conventions

From `CLAUDE.md`, which takes precedence over anything here:

- Bun, never npm/npx.
- Biome: tabs, double quotes.
- Frontend imports use the `#/*` alias.
- Prefer plain functions over classes.
- No comments narrating the change or the session; comment only where genuinely
  necessary. If a comment needs a long paragraph, the design is wrong.
- Do not create abstractions until complexity justifies them.
