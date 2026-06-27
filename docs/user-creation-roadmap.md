# Authentication & Initial Organization Setup (Better Auth + Polar Compatible)

## Overview

This document describes the initial authentication, onboarding, and organization creation flow for the SaaS platform using:

- Better Auth (authentication layer)
- Better Auth Organization Plugin (workspaces / businesses)
- Better Auth Polar Plugin (billing & subscriptions)

---

## Goals

Allow a user to:

- Register using email/password or Google OAuth
- Verify email before accessing the app
- Login securely
- Access a personal customer experience immediately
- Create one or more organizations (businesses)
- Select a paid plan before organization activation
- Complete payment via Polar
- Have the organization automatically activated after payment
- Enter organization onboarding (page builder setup)

---

## Core Concept Model

The system is based on three core entities provided by Better Auth:

- **User** → personal identity
- **Organization** → business/workspace
- **Membership** → relationship between user and organization

There is no "business owner role" or "customer role" at the account level.

All capabilities are derived from:
- whether a user has organizations
- whether they are inside an organization context

---

# 1. Registration Flow

## 1.1 Entry

User selects:

- Email registration
- Google OAuth

---

## 1.2 Email Registration

User provides:

- name
- email
- password

System behavior:

- Create user in Better Auth
- Send verification email
- Set user as `unverified`
- Block access to application features until verified

---

## 1.3 Google OAuth Registration

System behavior:

- Create user via OAuth provider
- If provider returns verified email → mark as verified
- Otherwise require email verification

---

## 1.4 Email Verification

Flow:

1. User clicks verification link
2. Token validated
3. User marked as verified
4. Redirect to application login/session

If token expires:
- user can request a new verification email

---

# 2. Login Flow

Supported methods:

- Email + password
- Google OAuth

Rules:

- User must exist
- Email must be verified

If not verified:
- Show "Verify your email" screen
- Allow resend verification email

---

# 3. First Application Access

After login:

Check:

```
Does user have an active session?
```

If yes:

Check organizations:

```
Has user joined any organizations?
```

---

## 3.1 No Organizations

User enters **Customer Mode (Personal Dashboard)**

They can:

- browse businesses
- view public pages
- book services (future feature)
- manage personal profile

They are NOT forced into organization creation.

---

## 3.2 Has Organizations

User enters last active organization context:

- organization dashboard
- CMS / page builder (later phase)

---

# 4. Organization Creation Flow

This flow can be triggered anytime from:

- empty dashboard state
- sidebar
- onboarding CTA
- settings page

---

## Step 1 — Create Organization (No Payment Yet)

User enters:

- Organization Name
- (optional later: slug, category)

System uses Better Auth Organization Plugin:

```
organization.create()
```

Result:

- Organization is created immediately
- User becomes OWNER member
- Organization status = `inactive` (billing not active yet)

---

## Step 2 — Plan Selection (Polar Product Selection)

User selects a subscription plan:

Examples:

- Starter
- Professional
- Enterprise

Each plan is defined in Polar.

No local subscription objects are created.

---

## Step 3 — Start Checkout (Polar Integration)

System calls Polar checkout:

```
authClient.checkout({
  slug: "professional",
  referenceId: organizationId
})
```

Key behavior:

- `referenceId = organizationId`
- Polar binds subscription to organization context

User is redirected to payment provider.

---

## Step 4 — Payment Processing

Handled entirely by Polar:

- payment success/failure
- subscription creation
- billing lifecycle

Application does NOT manually create subscriptions.

---

## Step 5 — Webhook Handling

Polar webhook updates:

- subscription status
- organization entitlement status

System behavior:

If payment succeeds:

- organization becomes `active`
- plan entitlements applied

If payment fails:

- organization remains `inactive`
- user can retry checkout without re-creating organization

---

## Step 6 — Post-Payment Redirect

After successful webhook confirmation:

User is redirected to:

```
Organization Onboarding Flow
```

---

# 5. Organization Onboarding Entry Point

After activation:

System checks:

```
Has organization completed onboarding?
```

If not:

- start onboarding wizard (page builder setup)
- otherwise go to dashboard

---

# 6. Customer Mode vs Organization Mode

## Customer Mode

Available when:

- user has zero or multiple organizations
- user is not inside an organization context

Features:

- browse businesses
- view pages
- book services (future)
- manage personal profile

---

## Organization Mode

Available when:

- user selects an organization
- or is redirected after onboarding

Features:

- CMS access
- page builder
- analytics (future)
- booking management (future)

---

# 7. Key System Rules

## 7.1 Organization First, Then Billing

- Organization MUST be created before checkout
- Billing is attached via `referenceId`

---

## 7.2 No Custom Subscription Tables

- Subscriptions are managed entirely by Polar
- Application reads subscription state from Better Auth Polar plugin

---

## 7.3 Email Verification Required

- No access to app until email is verified

---

## 7.4 Multi-Organization Support

A user can:

- create multiple organizations (based on plan limits)
- switch between organizations
- be member of multiple organizations

---

## 7.5 Extensibility for Future Features

This architecture supports:

- free trials (before checkout step)
- coupons / discounts
- subscription upgrades/downgrades
- staff invitations
- multi-organization plans
- usage-based billing
- multiple roles per organization
- switching active organization context

---

# 8. Final User Flow

```text
Landing Page
      │
      ▼
Register (Email / Google)
      │
      ▼
Email Verification
      │
      ▼
Login
      │
      ▼
Personal Dashboard (Customer Mode)
      │
      ├───────────────────────────────┐
      ▼                               ▼
Browse / Book                Create Organization
                                    │
                                    ▼
                        Organization Created (inactive)
                                    │
                                    ▼
                          Select Subscription Plan
                                    │
                                    ▼
                          Polar Checkout (referenceId)
                                    │
                                    ▼
                          Payment Processed (Webhook)
                                    │
                                    ▼
                       Organization Activated (active)
                                    │
                                    ▼
                        Organization Onboarding
```
