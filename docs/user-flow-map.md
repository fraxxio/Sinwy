# User Creation & Login Flow Map

## 1. Registration

```text
Entry (source captured in callbackURL: discovery | marketing)
│
├─ Email registration
│   → enter name, email, password
│   → user created (unverified)
│   → verification email sent
│   → user clicks link
│       ├─ token valid → user verified → go to [2. Post-verification redirect]
│       └─ token expired → resend verification email → wait for click
│
└─ Google OAuth
    ├─ provider email verified → user created (verified) → go to [2. Post-verification redirect]
    └─ provider email not verified → verification email sent → same as email flow
```

## 2. Post-verification redirect (first redirect only, source from callbackURL)

```text
├─ source = discovery → Customer Mode (personal dashboard)
└─ source = marketing → Organization Creation flow [5]
```

## 3. Login

```text
Enter credentials (email+password | Google)
│
├─ user not found → error
├─ email not verified → "Verify your email" screen → resend option
└─ success → go to [4. Post-login routing]
```

## 4. Post-login routing

```text
├─ an active organization (the session's if still active, else the newest) → org dashboard
├─ none active, owns one not scheduled for deletion → Account → Organizations
│   → activate it, choose or resume a plan, or upgrade [8]
└─ otherwise (staff of inactive orgs only, or no organization) → Customer Mode
    └─ "create your business" CTA → Organization Creation flow [5]
```

Outside the funnel screens, a toast prompts once per load: "Choose a plan"
for an owner of a draft with no plan, else "Finish setup" for an unfinished
organization [7].

User can always switch:
```text
├─ Customer Mode → select organization → Organization Mode (active ones only)
└─ Organization Mode → leave org context → Customer Mode
```

Rules: [org-rules-map.md](org-rules-map.md) §9.

## 5. Organization Creation

```text
Trigger (empty dashboard | sidebar | onboarding CTA | settings)
│
→ /organizations/new: name + industry → organization created, user = owner
├─ plan with a free slot → active → Organization Onboarding [7]
├─ plan at its cap, or suspended → draft → Organization Onboarding [7]
│   (the wizard says why it stays a draft)
└─ no plan → draft → Account → Billing → choose a tier → Polar checkout
    ├─ payment success → /checkout/success → [6. Activation]
    └─ payment failure or abandoned → stays a draft; choose a plan again anytime
```

Rules: [org-rules-map.md](org-rules-map.md) §4–§6.

## 6. Activation (success page)

```text
/checkout/success: "Activating your organization…" (polls the account plan)
│   funnel steps shown only when a draft waits for the plan
│
├─ plan landed
│   ├─ a plan bought to take over an organization → waits for the transfer
│   │   → Account → Organizations ("<org> is yours", or "hasn't moved yet")
│   ├─ the owner has a draft → activates the oldest → Organization Onboarding [7]
│   │   └─ refused (e.g. at the cap) → Account → Organizations with the reason
│   └─ no draft → Account → Billing
└─ timeout or unreachable → "payment received" fallback, retry
```

## 7. Organization Onboarding (setup wizard)

```text
/organizations/:id/onboarding — active orgs, and the owner's drafts
Step 1 — Business profile (tagline, description, contact, location)
│
├─ save
│   ├─ active → marked done → Organization Dashboard
│   ├─ draft with a free slot → activated, marked done → Organization Dashboard
│   └─ draft without a plan or a slot → profile kept, stays a draft
│       → Account → Organizations (the page's notice said why beforehand)
├─ "I'll do this later" (active) → Organization Dashboard, still unfinished
│   → prompted again on later visits, page reachable again anytime
└─ "Back to organizations" (draft) → Account → Organizations
```

Later steps (page template, plugins) land here as the page builder arrives.

Rules: [org-rules-map.md](org-rules-map.md) §4.

## 8. Account billing and organizations (anytime)

```text
Account → Billing (owner of the plan; never inside an organization)
├─ no plan → tier cards → Polar checkout → [6]
├─ plan → current tier, cap and active organizations, invoices, "Manage billing" (Polar portal)
│   ├─ Change plan → dialog: upgrade now, or downgrade at period end with picks
│   │   → pending change shown with "Stay on <tier>"
│   ├─ Suspend → dialog lists the orgs going offline → "Suspends on {date}", Undo
│   │   → period end: every org suspended → Resume panel (charges now)
│   ├─ Cancel → dialog lists the orgs going offline → "Cancels on {date}", Undo
│   │   → period end: every org inactive → tier cards again
│   └─ payment failed → notice here, banner on each org dashboard (owner only)

Account → Organizations
├─ each org with its state: Open, Deactivate, Activate, Upgrade, Choose a plan, Resume plan
├─ incoming ownership offers → Accept dialog (free slot, choose a plan, or upgrade) | Decline
└─ inactive orgs of other owners → "Ask the owner to …"

Organization settings (owner) → transfer ownership to a member, cancel the offer
Organization dashboard of an inactive org → nobody gets in; owner → Account → Organizations,
everyone else → Account with the reason
```

Rules: [org-rules-map.md](org-rules-map.md) §6–§10.

## 9. Booking as a customer (storefront)

```text
/<slug> → /<slug>/book (unknown or inactive org → "This booking page isn't available")
├─ pick a service → a date (today to 60 days ahead) → a free time
├─ confirm step: summary, price, cancellation policy, optional phone and note
│   ├─ signed out → login or sign-up → back to the confirm step (phone and note are lost)
│   └─ signed in → Book
│       ├─ service needs approval → "Request sent" (pending); both sides emailed
│       ├─ otherwise → "Booking confirmed"; both sides emailed
│       ├─ time taken meanwhile → pick another time
│       └─ 5 upcoming bookings at this org already → refused
└─ members may book their own organization
```

## 10. Customer Mode bookings

```text
/account → next upcoming booking and up to 3 "Book again" services
/account/bookings → Upcoming (pending, confirmed) | Past (the rest), 20 per page
├─ empty → explains bookings are made on a business's booking page
└─ a booking → org (link to its booking page, city, country), service, time,
   price, status, own note, decline or cancel reason, timeline
    ├─ Cancel → dialog with the policy → cancelled; both sides emailed
    │   └─ inside the cancellation window → no Cancel; the org's phone and email instead
    ├─ Add to calendar (.ics)
    └─ Book again → the org's booking page with the service picked
Only the user's own bookings; a manual booking with the same email never shows.
```

## 11. Account deletion

```text
Account → Settings → Delete account → dialog
├─ owned organizations listed, each with "N upcoming bookings will be cancelled"
├─ the user's own upcoming bookings counted: "will be cancelled, and the businesses told"
└─ type the email → link emailed → click it
    → plan revoked, owned orgs scheduled for deletion, their upcoming bookings
      cancelled and their customers emailed
    → the user's own upcoming bookings cancelled; the businesses emailed
    → goodbye page
```

Rules: [org-rules-map.md](org-rules-map.md) §9 and §11.

## 12. Bookings as staff

```text
/dashboard/<slug> → overview: today's bookings, booked this week, pending requests
                    (Approve, Decline with a reason), occupancy, needs attention
/dashboard/<slug>/bookings → Calendar (month, week, day) | List, in the org's zone
├─ empty spot in week or day → New booking at that time
├─ New booking → service, a free time or a custom start, name plus email or phone
│   → confirmed; the customer emailed when there's an email
└─ a booking → detail: actions by status (Confirm, Decline or Cancel, Complete,
   No-show, Reschedule), contact (editable on manual bookings only), the
   customer's note, internal note, history
```

Rules: [bookings-mvp-plan.md](bookings-mvp-plan.md) Decisions; lifecycle in
[org-rules-map.md](org-rules-map.md) §9 and §11.
