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
4. Redirect to application frontend (User should already be logged in after registering): 
    1. if it was regular registered user from services discovery platform we redirect that platform main page.
    2. if user came from business platform marketing page then we redirect to organization creation flow. 

The registration source is **transient**: it is carried in the signup's `callbackURL` (Better Auth threads it through the verification link and OAuth callback) and affects exactly one redirect — the first one after registration/verification. It is never persisted. Any later login with zero organizations lands in Customer Mode with a "create your business" CTA.

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

After login or registration auto login:

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

They are NOT forced into organization creation. (Only the *first* redirect after registration routes marketing-page users into organization creation — see 1.4. Later logins always land here.)

---

## 3.2 Has Organizations

User enters last active organization context (based on their role, which will decide permissions):

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
- Industry (required; persisted on the organization, defaults to `other`)
- (optional later: slug)

Industry drives template/layout preselection in onboarding, and is the category
dimension for discovery, public-page SEO and segmentation later. The value list
lives in `@sinwy/shared` so validation and the select can't drift.

Creation goes through a **custom backend endpoint only** (`POST /organizations` in an `organizations` module). Client-side creation is disabled via `allowUserToCreateOrganization: false`; the endpoint calls `auth.api.createOrganization` server-side. This endpoint is the future home of org-creation business rules and custom org data.

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

System behavior — **organization status is a pure projection of Polar subscription state**, across the whole lifecycle:

- subscription becomes active → organization `active`
- subscription revoked/expired (renewal failure after Polar's dunning, or cancellation) → organization `inactive`
- first payment fails → organization stays `inactive`; user can retry checkout without re-creating the organization

`inactive` means: data kept, management features gated, public pages unpublished. No grace-period logic of our own — Polar's retry/dunning settings are the grace period.

Plans entitle nothing else yet: no entitlement storage, no per-plan feature flags. When a feature first needs to differ by plan, read subscription state from the Polar plugin.

---

## Step 6 — Post-Payment Redirect

Polar redirects the browser to our success page immediately after payment; the webhook arrives asynchronously. The success page shows "Activating your organization…" and polls organization status (~2s interval, with a timeout fallback message). When status flips to `active`, route to:

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

Mode is purely a frontend routing concept over Better Auth's **active organization**: an active organization context set → Organization Mode; none → Customer Mode. Every user can switch to Customer Mode at any time, regardless of how many organizations they own. Login lands in the last active organization if one exists, else Customer Mode.

## Customer Mode

Available when:

- user has no active organization context (always switchable to)

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

- create multiple organizations (unlimited — they are `inactive` and unpaid until checkout; plans belong to organizations, not users, so there is no per-user plan limit to enforce)
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