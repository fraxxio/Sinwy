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
