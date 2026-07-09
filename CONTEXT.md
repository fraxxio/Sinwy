# Sinwy

A SaaS platform where businesses build public pages (page builder / CMS) and customers discover and browse them. Identity, workspaces, and billing are built on Better Auth (organization + Polar plugins).

## Language

**User**:
A personal identity (one human). Has no account-level role — capabilities derive from organization memberships and context.
_Avoid_: Account, customer role, business owner role

**Organization**:
A business/workspace owned by users through memberships. Created before any payment, in `inactive` status.
_Avoid_: Business, workspace, company

**Membership**:
The relationship between a User and an Organization, carrying the user's role in it (e.g. owner).
_Avoid_: Team member record

**Organization Status**:
Billing-derived lifecycle of an organization: `inactive` (created, no active subscription) or `active` (subscription confirmed via Polar webhook). Not to be confused with onboarding completion.

**Customer Mode**:
The experience of a user with no active organization context: browsing businesses, viewing pages, (future) booking. Available to every user at any time, regardless of organizations owned.
_Avoid_: Personal dashboard, customer account

**Organization Mode**:
The experience inside an active organization context: dashboard, CMS/page builder, management features. Entered by selecting an organization (or landing in the last active one on login).
_Avoid_: Business mode, admin mode

**Registration Source**:
Where a user started registration (discovery platform vs business marketing page). Transient — carried only through the signup redirect (callbackURL) to pick the first post-verification destination; never persisted.
_Avoid_: CTA source, user type
