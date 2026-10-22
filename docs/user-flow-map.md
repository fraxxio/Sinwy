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
├─ has an organization (last active, else most recent) → Organization Mode
│   ├─ active → org dashboard
│   ├─ lapsed (inactive, onboarding completed) → read-only org dashboard [8]
│   └─ inactive, setup never finished → Plan selection [5]
└─ no organization → Customer Mode
    └─ "create your business" CTA → Organization Creation flow [5]
```

User can always switch:
```text
├─ Customer Mode → select organization → Organization Mode
└─ Organization Mode → leave org context → Customer Mode
```

## 5. Organization Creation

```text
Trigger (empty dashboard | sidebar | onboarding CTA | settings)
│
→ enter organization name + industry
→ POST /organizations (custom endpoint)
→ organization created: status = inactive, user = owner
→ Plan selection (Starter | Professional | Enterprise)
→ Polar checkout (referenceId = organizationId)
│
├─ payment success → redirect to success page → go to [6. Activation]
├─ payment failure → org stays inactive → retry checkout (same org)
└─ user abandons → org stays inactive → resume from plan selection anytime
```

## 6. Activation (success page)

```text
Success page: "Activating your organization…" (poll org status ~2s)
│   funnel steps shown only while setup was never finished (not on a renewal)
│
├─ status → active (webhook arrived)
│   ├─ onboarding not completed → Organization Onboarding [7]
│   └─ onboarding completed → Organization Dashboard
└─ timeout → fallback message, keep org inactive, retry/poll later
```

## 7. Organization Onboarding (post-activation wizard)

```text
Step 1 — Business profile (tagline, description, contact, location)
│
├─ save → organization.onboardingCompletedAt set → Organization Dashboard
└─ "I'll do this later" → Organization Dashboard, still marked unfinished
    → resume prompt on later logins, page reachable again anytime
```

Later steps (page template, plugins) land here as the page builder arrives.

## 8. Subscription lifecycle (webhook-driven, anytime)

```text
├─ subscription active / trialing / past due → org status = active
│   └─ owner changes plan (Settings → Billing, or "Upgrade plan" on a gated feature)
│       → POST /organizations/:id/subscription/plan
│       → Polar switches the plan now, prorated difference on the next invoice
│       → plan + features updated in place, org stays active
├─ canceled at period end (Polar portal) → still active, "Cancels on {date}"
│   → plan change disabled until renewed in the portal
└─ subscription revoked / expired / canceled → org status = inactive (lapsed once onboarded)
    → data kept, writes paused, public pages unpublished
    → banner on every org dashboard page
    │   ├─ owner → "Choose a plan" → Plan selection (renew copy, no funnel steps)
    │   │   → Polar checkout → [6. Activation] → Organization Dashboard, banner gone
    │   └─ staff → "Ask an owner to renew"
    → login → read-only org dashboard [4], no "finish setup" resume prompt
```
