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
├─ has last active organization → Organization Mode (org dashboard)
└─ no active organization → Customer Mode
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
→ enter organization name
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
│
├─ status → active (webhook arrived)
│   ├─ onboarding not completed → Organization Onboarding (placeholder)
│   └─ onboarding completed → Organization Dashboard
└─ timeout → fallback message, keep org inactive, retry/poll later
```

## 7. Subscription lifecycle (webhook-driven, anytime)

```text
├─ subscription active → org status = active
└─ subscription revoked / expired / cancelled → org status = inactive
    → data kept, management gated, public pages unpublished
    → owner can re-checkout → back to [5. Plan selection]
```
