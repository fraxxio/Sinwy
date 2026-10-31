# Organization and billing rules

How organizations and their billing behave, as owners, members and customers
see it. The code is the source of truth; change this map together with any
change to these rules. The user's path through the screens is in
[user-flow-map.md](user-flow-map.md).

Decisions (D1–D15) and Defaults (1–11) were settled with the product owner;
they are cited where a rule comes from one. **Differs from decision** marks
where the code does something else; both versions are given, and
[14](#14-known-gaps) lists them.

## 1. Terms

```text
Roles
├─ Owner      the one member an organization runs on; their plan pays for it [2]
├─ Admin      runs the organization day to day; no billing [2]
└─ Staff      works in it: bookings and customers [2]

Billing
├─ Plan       a user's one subscription [5]
├─ Tier       Starter, Professional ("Business" on screen) or Enterprise
├─ Cap        organizations a tier keeps active at once: 1, 2 or 5
├─ Slot       one unit of the owner's cap, held by one organization [6]
└─ Grants access   a plan that is active, trialing or past due; not paused or ended

Organization states [3]
├─ Active     holds one of its owner's slots, the owner's plan grants access,
│             and it isn't scheduled for deletion; the only state anyone can open
├─ Inactive   any other state; the ones below are its kinds
├─ Draft      holds no slot and never finished setup [4]
├─ Suspended  holds a slot; the owner paused their plan [8]
├─ Lapsed     holds a slot; the owner's plan ended [8]
└─ Scheduled for deletion   its owner deleted their account; purged after 30 days [11]
```

Past due is not an organization state: the plan still grants access while
Polar retries the charge [8].

Enforced in: `Sinwy.Shared/types/` (`access/`, `plan/`, `organization/`),
`Sinwy.Backend/modules/organizations/service.ts`.

## 2. Roles

```text
Exactly one owner per organization; any number of admins and staff
├─ owner → everything, billing included
├─ admin → everything but billing: bookings, services, customers, pages,
│          payments (read), analytics, people (invite, remove, change roles), settings
└─ staff → bookings and customers; services and pages read-only

The one owner
├─ whoever creates the organization is its owner
├─ inviting someone as owner, promoting a member to owner, or changing the
│  owner's own role → refused
├─ the owner can't leave
└─ ownership moves only by a transfer [10], or through support's tool

Who sees billing (D15)
├─ owner → plan, invoices, payment method and every billing action, on their
│          own Account → Billing only; never inside an organization
├─ admin → the tier name inside the organization, nothing else
├─ staff → nothing; the tier's feature gates still apply to them
└─ the past-due banner → owner only [8]

Members other than the owner never need a plan.
```

Enforced in: `Sinwy.Shared/types/access/`, `Sinwy.Backend/modules/auth/`
(`singleOwner.ts`, `auth.ts` organization hooks, `requirePermission.ts`),
`modules/organizations/service.ts`.

## 3. Organization states and transitions

```text
Draft (no slot, setup unfinished)
├─ owner activates it, with a plan and a free slot → Active [6]
├─ owner finishes its setup, with a plan and a free slot → Active [4]
├─ owner's checkout succeeds → their oldest draft → Active [4]
└─ owner deletes their account → Scheduled for deletion [11]

Active
├─ owner deactivates it → Inactive without a slot (reads Draft if setup
│  never finished) [6]
├─ owner's plan pauses at the period end → Suspended [8]
├─ owner's plan ends → Lapsed [8]
├─ owner's cap drops below their active count → may lose its slot → Inactive [7]
├─ transfer completes → stays Active, on the new owner's slot [10]
├─ owner deletes the organization → gone at once [11]
└─ owner deletes their account → Scheduled for deletion [11]

Inactive without a slot (deactivated, or released by a lower cap)
├─ owner activates it → Active [6]
└─ owner deletes their account → Scheduled for deletion

Suspended (slot kept)
├─ owner resumes → Active, the same organizations as before [8]
├─ plan ends while paused → Lapsed
├─ owner deactivates it → Inactive without a slot
└─ owner deletes their account → Scheduled for deletion

Lapsed (slot kept, Default 8)
├─ owner buys a new plan → Active again, within the new cap [7]
├─ owner deactivates it → Inactive without a slot
└─ owner deletes their account → Scheduled for deletion

Scheduled for deletion (no slot)
├─ 30 days pass → purged [11]
└─ no way back: restore isn't built [11]
```

Each transition into a state other than Active also takes the organization
out of every member's open session [9].

Enforced in: `Sinwy.Backend/modules/organizations/` (`access.ts`,
`service.ts`, `slots.ts`); web `src/shared/lib/organizations.ts` (badges and
reasons).

## 4. Creating an organization and onboarding

```text
Any signed-in user creates one (name, industry) → they are its owner
(Better Auth's own create endpoint is refused; creation goes through the app)
├─ its timezone is the browser's; an unknown or missing one → UTC. The owner
│  or an admin changes it on the business hours page
├─ its currency is EUR until the profile names a country; every profile save
│  sets it from the country (unknown → EUR). Services copy it when created
│  and keep it when it later changes; nobody sets it directly
├─ plan with a free slot → Active at once → setup wizard
├─ plan at its cap → Draft (D5) → the wizard says it stays a draft until a slot is free
├─ plan suspended → Draft → the wizard says to resume the plan first
└─ no plan → Draft → Account → Billing to choose a plan
    → checkout → success page waits for the plan, then activates the owner's
      oldest draft → setup wizard
       ├─ activation refused (e.g. at the cap) → notice, Account → Organizations
       └─ the plan doesn't show up in time → "payment received", retry

Setup wizard (business profile)
├─ who: the owner and admins (the web opens a draft's wizard to its owner only)
├─ saving the profile: active organizations and drafts, by the owner or an
│  admin; other inactive ones → refused
├─ finishing:
│   ├─ active → marked done
│   ├─ draft, by its owner → takes a free slot (Default 10) → Active, marked done
│   │   ├─ no plan → refused; stays a draft, the profile kept
│   │   └─ at the cap → refused; stays a draft, the profile kept
│   ├─ draft, by an admin → refused: only the owner fills a slot (D7)
│   └─ other inactive → refused
└─ "I'll do this later" → stays unfinished; prompted again

Prompt on later visits (not on the funnel's own screens), at most once per load
├─ owns a draft and has no plan at all (a paused plan counts as one) → "Choose a plan"
└─ else owns an unfinished organization that is active, or a draft while a
   slot is free → "Finish setup"

Drafts and inactive organizations never expire (Default 5).
```

Enforced in: `Sinwy.Backend/modules/organizations/` (`service.ts`,
`controller.ts`, `utils.ts`), `modules/services/service.ts` (timezone,
service currency), `modules/user/service.ts` (prompts),
`Sinwy.Shared/types/organization/` (`TimeZone.ts`, `Currency.ts`); web
`src/modules/organizations/routes/`, `src/modules/checkout/routes/success.tsx`,
`src/modules/user/lib/resume-prompt.ts`.

## 5. The account plan

```text
One plan per user (D1), one invoice per period in one billing name (D2)
├─ Starter      cap 1; no extra features
├─ Professional cap 2; page builder, custom domain, advanced analytics
└─ Enterprise   cap 5; Professional's features and multiple locations

Features
├─ every active organization the user owns gets their tier's features (D3)
├─ an inactive organization has none
└─ using a feature the tier lacks → refused, "upgrade required"

Buying a plan (checkout, Account → Billing)
├─ the plan is always the buyer's own; it can't name an organization
├─ the user already has one (active, trialing, past due or paused) → refused:
│  change or resume it instead
└─ two checkouts racing past that check → the second plan is revoked and
   refunded in full

One trial per user (D10)
├─ the first plan a user ever holds may carry the product's trial
├─ every later checkout has the trial turned off, also after that plan ended
└─ deleting the account and signing up again → Polar's "Prevent trial abuse"
   (email and card) refuses a second trial
```

Enforced in: `Sinwy.Shared/types/plan/`, `Sinwy.Backend/modules/billing/`
(`checkoutGuard.ts`, `projection.ts`), `modules/auth/auth.ts` (checkout hook),
`modules/auth/requireFeature.ts`.

## 6. Slots

```text
What counts toward the cap (D4)
├─ owned organizations that hold a slot and aren't scheduled for deletion
├─ drafts and deactivated organizations don't count
└─ scheduling an organization for deletion frees its slot at once

Activate (owner only, Account → Organizations)
├─ it already holds a slot → done, nothing changes
├─ no plan that grants access (none, ended or paused) → refused, "plan required"
├─ at the cap → refused, "limit reached": deactivate another or upgrade
└─ otherwise → it holds a slot → Active
Two activations at the same time never pass the cap.

Deactivate (owner only)
→ frees the slot; the organization is inactive at once and leaves every open session
→ free: no billing change; works in any state but scheduled for deletion

A freed slot is never filled by itself (D7): the owner activates the one they want
├─ not after an upgrade, a deactivation or a deletion
└─ a new organization still takes a free slot (Default 10): at creation, when
   its owner finishes a draft's setup, and on the success page after a checkout

A slot survives a lapse or a pause (Default 8): when the plan grants access
again, the same organizations are active.
```

**Differs from decision (D7, edge case).** A draft is derived: no slot and
setup never finished. An organization activated before finishing setup and
then deactivated reads as a draft again, so finishing its setup, or the
success page after a later checkout, fills a freed slot with it. D7 says only
the owner's Activate fills a freed slot. Telling the two apart would need an
"ever activated" record.

Enforced in: `Sinwy.Backend/modules/organizations/` (`slots.ts`,
`service.ts`, `routes.ts`); web
`src/modules/account-dashboard/routes/_shell.organizations.tsx`.

## 7. Plan changes

```text
Only in the app, on Account → Billing; plan switching is off in Polar's portal (D6)
Refused while: no plan, suspended, a suspension or a cancellation pending, the
same tier as now, or the subscription already canceled in Polar
Allowed during a trial and while past due.

Upgrade (Default 7)
→ takes effect now; the prorated difference goes on the next invoice
→ the new cap applies at once; nothing activates by itself (D7)
→ drops a pending downgrade and its picks

Downgrade (D6)
├─ the active organizations fit the new cap → scheduled, nothing to pick
├─ more are active than the new cap → the owner picks which stay (no more
│  than the cap, active ones only); without picks → refused, "picks required"
→ takes effect at the period end; until then the tier, features and every
  organization stay as they are
→ at the period end: the organizations not kept lose their slot; no email
→ "Stay on <tier>" takes it back before the period end
→ another downgrade replaces it; an upgrade drops it
→ while pending: suspend and cancel are refused [8]

The cap drops below the active count without picks (Default 9)
(a downgrade applied outside the app, a new plan with a lower cap after a
lapse, or an organization activated after the picks were made)
→ the earliest-activated organizations keep their slots, the rest lose them
→ the owner is emailed the names of the ones that went inactive
→ only a plan that grants access is fitted; a paused or ended one keeps every slot
```

Enforced in: `Sinwy.Backend/modules/billing/` (`service.ts`, `repository.ts`,
`projection.ts`), `modules/organizations/slots.ts`; web
`src/modules/account-dashboard/lib/plan-change.ts`.

## 8. Suspend, resume, cancel, lapse and past due

```text
Each acts on the plan, so on every owned organization together (D8, D9)
The suspend and cancel dialogs list the organizations that go offline.

Suspend (D8)
├─ refused: no plan, already paused, trialing (Default 4), past due, a
│  suspension or cancellation already pending, a downgrade pending
→ pauses at the end of the paid period; no refund; everything stays active until then
→ "Undo" any time before then
→ at the period end → every owned organization with a slot is Suspended (slot kept)
→ while suspended: no checkout, activation, plan change, transfer offer or acceptance
→ Resume, one click: Polar charges now for a new period → the same organizations active
   ├─ the charge fails and Polar retries → active, past due; fix the payment in Polar
   └─ the charge fails and it stays paused → refused, still suspended

Deactivating one organization is separate: free, and it only frees its slot [6].

Cancel (D9)
├─ refused: no plan, paused (resume first), a suspension or cancellation
│  already pending, a downgrade pending
├─ allowed while trialing or past due
→ ends at the end of the paid period; no refund; everything stays active until then
→ "Undo" any time before then, also for a cancel made in Polar's portal
→ at the period end → Lapsed

Lapse
├─ the plan ends (canceled at the period end, revoked, or Polar gives up on a
│  failed payment) → every owned organization inactive, slots kept (Default 8),
│  out of every open session
└─ the owner chooses a plan on Billing → a new checkout → the same organizations
   active again, within the new cap [7]

Past due
→ Polar retries the charge; the plan still grants access and everything stays active
→ the owner sees a banner on each organization's dashboard and a notice on
  Billing; admins and staff see nothing
→ Polar gives up → Lapse
```

Enforced in: `Sinwy.Backend/modules/billing/` (`service.ts`, `controller.ts`,
`projection.ts`); web `src/modules/account-dashboard/components/billing/`,
`src/modules/account-dashboard/lib/subscription-status.ts`.

## 9. What an inactive organization means

```text
Nobody opens an inactive organization's dashboard
├─ opening it (link, switcher, bookmark, stale tab) → refused
│   ├─ owner → Account → Organizations, to activate it or sort out the plan
│   └─ everyone else → their account, with the reason
├─ an organization that goes inactive leaves every open session; an open tab
│  is turned away on its next load or write
└─ exception: the owner's draft keeps its setup wizard [4]

Switcher and Account → Organizations
├─ active → opens
├─ inactive, owner → leads to Account → Organizations: Activate, Upgrade,
│  Choose a plan or Resume plan
├─ inactive, everyone else → disabled, with the reason ("ask the owner to …")
└─ scheduled for deletion → disabled for everyone, with the deletion date

Post-login
├─ the session's organization if still active, else the newest active one → its dashboard
├─ none active, owns one that isn't scheduled for deletion → Account → Organizations
└─ otherwise → the personal account (Customer Mode)

Members' requests to an inactive organization
├─ reads (its summary, status, setup data, members, invitations) → answered
├─ setup writes, except on the owner's draft [4] → refused, "organization inactive"
├─ services, business hours (and timezone) and closures: reads and bookable
│  times answered, writes refused, "organization inactive"
├─ managing it (rename, delete, invite, cancel invitations, remove members,
│  change roles) → refused, "organization inactive"
├─ paid features → refused, "upgrade required"
└─ leaving → allowed

Public pages, booking pages and custom domains: only for an active organization.
None are built yet; every new public route must follow this rule.
```

Enforced in: `Sinwy.Backend/modules/auth/` (`activeOrganization.ts`,
`requirePermission.ts`, `requireFeature.ts`),
`modules/organizations/service.ts`, `modules/services/service.ts`; web
`src/shared/lib/organizations.ts`,
`src/modules/auth/lib/post-login.ts`,
`src/modules/org-dashboard/routes/_shell.tsx`,
`src/shared/components/shell/OrganizationSwitcher.tsx`.

## 10. Ownership transfer

```text
Offer (owner only, the organization's settings)
├─ only to an existing member, not to themselves (D11)
├─ the organization must be active: suspended → resume first; otherwise inactive → refused
├─ one open offer per organization; another → refused, "transfer pending"
├─ open for 7 days; the recipient is emailed and finds it on Account →
│  Organizations, without the tier (they may be staff, D15)
└─ the organization stays the owner's, on their slot, until it completes

Accept (the recipient), by their plan (D11)
├─ a free slot → completes at once
├─ no plan → "accepted": they choose a plan, the checkout carries the offer,
│  and it completes once the plan lands
│   └─ their last slot got used meanwhile → stays "accepted" until they upgrade
├─ plan full → refused, "needs a slot"; the dialog upgrades to the cheapest
│  tier with room, then accepts
│   └─ no tier has room (Enterprise, 5 active) → they deactivate one first
├─ plan suspended → refused, "plan suspended"; the offer stays open until they resume
├─ expired → refused, "expired"
└─ declined, canceled or completed → not found
The organization's own state isn't checked again at acceptance: if the old
owner's plan lapsed or paused meanwhile, it still completes, active on the
recipient's plan.

On completion
→ the recipient is the owner; the old owner stays on as admin
→ the organization leaves the old owner's slot and takes one of the recipient's
→ the old owner's plan doesn't change (D12): they downgrade or cancel
  themselves; nothing is refunded
→ both are emailed

Closing an offer
├─ the recipient declines, or the owner cancels it → closed
├─ 7 days pass → expired
├─ the recipient leaves or is removed → canceled
├─ the owner deletes their account → canceled [11]
└─ a plan bought or upgraded for an offer that then closes → kept; nothing
   refunded (Default 11)

Support's tool moves ownership to a member without an offer: the organization
keeps a slot only if the new owner has one free, otherwise it goes inactive.
```

Enforced in: `Sinwy.Backend/modules/transfers/`,
`modules/organizations/slots.ts`, `modules/billing/projection.ts` (completion
when the plan lands); web `src/modules/account-dashboard/lib/transfer-accept.ts`.

## 11. Leaving, removal, deletion and retention

```text
Leaving and removal (API only; no screen yet)
├─ a member who isn't the owner can leave; the owner can't [2]
├─ the owner and admins remove members and change roles, never to or from owner
├─ either cancels open transfers to that member [10]
├─ on an inactive organization: leaving works, removing and role changes are refused [9]
└─ on one scheduled for deletion: everything is refused, so the members stay

Deleting an organization (owner only; API only, no screen yet)
├─ active → deleted at once with its data; frees its slot; no billing change (Default 1)
└─ inactive or a draft → refused, "organization inactive"

Owner account deletion (confirmed from an emailed link, D13)
→ the dialog and the email say the plan ends at once with no refund and that
  owned organizations go offline, then are deleted after 30 days; the dialog
  lists them
→ the plan is revoked at once, also when paused or past due; no refund
   └─ Polar refuses → nothing changes; the goodbye page shows the error
→ every owned organization → Scheduled for deletion: its slot freed, pending
  invitations and open transfers canceled, out of every open session
→ the Polar customer, if the user ever had one, is anonymized; it keeps the
  deleted user's id as its external id, which no new user gets, so its late
  webhooks are ignored as an unknown user
A member who isn't an owner deleting their account leaves the organizations
untouched; their memberships and the offers to them go with them.

Retention (30 days)
├─ hidden from everyone: no opening, reads, writes, invitations or transfers
├─ the members stay
└─ restore isn't built; it will need a new owner chosen from the remaining
   members, and keeps nothing about the deleted user (Default 6)

Purge (hourly)
→ organizations without an owner, scheduled 30 days ago or more → deleted with
  their data and logo
→ repairs first, skipping anything under an hour old:
   ├─ without an owner but never scheduled → scheduled now
   └─ scheduled but still has an owner (the account deletion failed) →
      unscheduled; it comes back inactive, without its slot
→ drafts and inactive organizations with an owner are never purged (Default 5)
```

**Differs from decision (Default 1).** Default 1 keeps an owner's own
deletion of an organization immediate. The code refuses it while the
organization is inactive, drafts included, so an owner can't delete a draft
or a lapsed organization without a plan and a free slot.

Enforced in: `Sinwy.Backend/modules/auth/` (`auth.ts` user deletion and
organization hooks, `activeOrganization.ts`), `modules/organizations/`
(`repository.ts`, `purge.ts`), `modules/billing/service.ts` (revocation),
`modules/transfers/`.

## 12. Polar's part

```text
Polar holds: products and prices, the subscription (status, billing period,
scheduled plan change, pause, cancellation), payments, refunds, invoices, one
customer per user (keyed by the user's id) and the customer portal.
The customer is created just before the user's first checkout or portal visit,
never on sign-up, so sign-up works while Polar is down. It takes the account's
email and name, which every user update syncs and each checkout or portal
visit repairs.
The app holds: which plan each user is on, slots, organizations and roles,
transfers, and the organizations a downgrade deactivates.

Polar is the source of truth for the plan
├─ its webhooks (subscription active, updated, revoked, paused, resumed) set
│  the user's plan
├─ a repeated or older delivery never overrides newer state
├─ the app also asks Polar, to heal a missed webhook: on every Billing page
│  load, before a checkout, before each plan action, on the checkout success
│  page, and when an organization holding a slot looks lapsed
│   └─ a failed lookup never takes a plan away
└─ a product that maps to no tier → no plan, organizations inactive, logged

Polar webhook endpoint (sandbox and production)
├─ events: subscription active, updated, revoked, paused, resumed; all five
│  are handled, nothing else is subscribed
├─ API version 2026-10, format raw: the Better Auth plugin parses deliveries
│  with 2026-10 models, so move only once it does
└─ sandbox: points at the developer's ngrok tunnel and stays enabled;
   deliveries land only while `bun run start:localproxy` runs, and Polar
   disables the endpoint after 10 failed deliveries in a row → re-enable it

Polar settings (dashboard only; the API can't change them)
├─ "Allow multiple subscriptions": off (D1)
├─ portal plan switching: off (D6); portal pause: off (Default 3)
├─ portal cancel: Polar always allows it; it shows as a pending cancellation
│  on Billing, which can be undone, and then lapses (Default 3)
├─ "Prevent trial abuse": on (D10)
└─ production is a separate Polar organization; check each setting there too

Money
├─ upgrade: prorated on the next invoice
├─ downgrade, suspend, cancel: no refund, no credit
├─ a second plan from a raced checkout: refunded in full
├─ account deletion: revoked, no refund
└─ invoices: Account → Billing; a download needs a paid order and billing
   details, which are added in Polar's portal

No migration (D14): the per-organization model was replaced outright, before
any paying customers.
```

Enforced in: `Sinwy.Backend/modules/billing/` (`projection.ts`,
`checkoutGuard.ts`, `invoices.ts`, `refunds.ts`), `modules/auth/auth.ts`
(Polar plugin), `Sinwy.Backend/infrastructure/polar/`.

## 13. User-facing errors

Each refusal a rule produces. App routes answer `{ code }` with the numeric
code; Better Auth's endpoints answer the string code.

| Code | HTTP | When |
| --- | --- | --- |
| `ORGANIZATION_INACTIVE` (4091) | 409 | Setup write on an inactive organization that isn't a draft; an admin finishing a draft; an offer for an inactive organization |
| `ORGANIZATION_INACTIVE` (Better Auth) | 403 | Opening an inactive or scheduled organization; any organization endpoint on a scheduled one; managing an inactive one; inviting to or joining a scheduled one |
| `PLAN_REQUIRED` (40911) | 409 | Activating or finishing a draft without a plan that grants access; any plan action (change, stay on, suspend, undo, resume, cancel) without a plan |
| `ORGANIZATION_LIMIT_REACHED` (40912) | 409 | Activating or finishing a draft at the cap |
| `PLAN_EXISTS` (Better Auth) | 400 | A checkout while the user has a plan, paused included |
| `BILLING_UNAVAILABLE` (Better Auth) | 503 | A checkout or the portal while Polar fails, times out or can't be reached; try again |
| `BILLING_ACCOUNT_REJECTED` (Better Auth) | 409 | A checkout or the portal when Polar refuses the customer, or another Polar customer holds the account's email; contact support |
| `PLAN_SUSPENDED` (40918) | 409 | A plan change, suspend, cancel or their undo while paused; accepting a transfer while paused |
| `PLAN_NOT_SUSPENDED` (4094) | 409 | Resume when the plan isn't paused |
| `ORGANIZATION_SUSPENDED` (4093) | 409 | Offering a suspended organization |
| `SUSPENSION_PENDING` (4095) | 409 | A plan change, suspend or cancel while a suspension is pending |
| `SUSPENSION_NOT_PENDING` (4096) | 409 | Undoing a suspension that isn't pending |
| `CANCELLATION_PENDING` (4097) | 409 | A plan change, suspend or cancel while a cancellation is pending |
| `CANCELLATION_NOT_PENDING` (40916) | 409 | Undoing a cancellation that isn't pending |
| `SUBSCRIPTION_TRIALING` (4098) | 409 | Suspend during a trial |
| `SUBSCRIPTION_PAST_DUE` (4099) | 409 | Suspend while past due |
| `PLAN_CHANGE_PENDING` (40917) | 409 | Suspend or cancel while a downgrade is pending |
| `PLAN_CHANGE_NOT_PENDING` (40915) | 409 | "Stay on" with no downgrade pending |
| `DOWNGRADE_PICKS_REQUIRED` (40914) | 409 | A downgrade below the active count without picks |
| `RESUME_PAYMENT_FAILED` (4022) | 402 | Resume whose charge failed, the plan still paused |
| `PLAN_UPGRADE_REQUIRED` (4021) | 402 | A feature the tier lacks, or any feature on an inactive organization |
| `TRANSFER_PENDING` (40910) | 409 | A second offer while one is open |
| `RECIPIENT_NEEDS_PLAN` (40913) | 409 | Accepting with a full plan (the name is older than the rule: they have a plan, but no free slot) |
| `ORDER_NOT_PAID` (4092) | 409 | Downloading the invoice of an unpaid order |

Without a code of their own: same tier (400), picks that aren't active
organizations or exceed the cap (400), plan change on a canceled subscription
(409), subscription busy with another update (409), Polar refused (422) or
unreachable (502), offer to yourself or a non-member (400), expired offer
(410), closed offer (404), checkout for an offer not waiting on it (400),
invoice without billing details (409), the owner leaving (400), an owner role
in an invitation or role change (403), a non-member or a scheduled
organization on the app's routes (404), a role without the permission (403).

Enforced in: `Sinwy.Shared/types/api/ApiResponse.ts`,
`Sinwy.Shared/types/auth/Auth.ts`; the `controller.ts` of
`Sinwy.Backend/modules/billing/`, `organizations/` and `transfers/`;
`modules/auth/activeOrganization.ts`, `modules/billing/checkoutGuard.ts`.

## 14. Known gaps

Differs from decision:
- D7: a once-activated organization that never finished setup is a draft
  again after Deactivate and can refill a freed slot [6].
- Default 1: an owner can't delete an inactive organization or a draft [11].

Open, product or copy:
- A recipient with a pending downgrade can accept into a free slot; at the
  period end the transferred organization is the latest-activated, so it
  loses its slot and they are emailed (Default 9) [7, 10].
- Leaving, removing members, invitations and deleting an organization have
  no screen yet [11].
- `/organizations/new` shows the Plan and Pay steps to a user who already has
  a plan; Account → Organizations labels admins "Member".
- Resume charges on one click with no confirmation, unlike suspend and
  cancel; the "Choose a plan" intro on Billing speaks of one organization
  even when several wait.
- The plan-change and accept-transfer dialogs show USD catalog prices while
  Polar charges EUR.
- The new-service form reads the price in the currency the page loaded with;
  if the country (so the currency) changes in another tab meanwhile, the
  amount is stored in the new currency's minor units. The list shows the
  stored currency, so it's visible.
- `invite-member` accepts `role: "member"`, which isn't an app role.
- Better Auth logs a refused open (inactive organization) and the checkout
  refusals at ERROR level, though they are user-caused.
- Rules with no test (checked against the suites when this map was written):
  past-due banner and switcher states (web); admins removing members or
  changing roles; deactivating a suspended or lapsed organization; creating
  while suspended; the success page activating the oldest draft and its
  refused and timeout paths; a draft's profile kept after a refused finish;
  activating with an ended plan; D7's "nothing fills by itself"; a plan
  change during a trial or while past due; a fitting downgrade scheduled
  without picks; a second downgrade replacing the first; Default 9 for an
  organization activated after the picks; undoing a cancellation while
  paused; offering or accepting for an organization scheduled for deletion;
  completion after the old owner's plan lapsed or paused; the 7-day offer
  length; the transfer routes' HTTP codes (`TRANSFER_PENDING`,
  `RECIPIENT_NEEDS_PLAN`, `ORGANIZATION_SUSPENDED`, 410, 404); the owner's
  own delete of an inactive organization; the purge repair leaving an
  organization without its slot; the account deletion copy.
- The missed-webhook check takes Polar's state only when it is newer than the
  stored one, so a plan cleared by hand while the stored time stays current
  isn't healed: Billing offers a checkout, which the checkout guard refuses
  [12].
- Not checked in the running app: transfer completion through a real
  webhook delivery, the Billing page's past-due notice after a real failed
  charge.
