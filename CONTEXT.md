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
Billing-derived lifecycle of an organization: `inactive` (no subscription granting access) or `active` (subscription confirmed via Polar webhook). Nobody opens an inactive organization's dashboard; its owner can only reach the plan page. An inactive organization is never-paid (setup never finished), lapsed (was set up, then its subscription ended) or Suspended. Not to be confused with onboarding completion.

**Suspended**:
An organization whose owner paused its subscription. It stays active until the paid period ends, then is inactive until the owner resumes it, which charges right away with no new checkout.
_Avoid_: Paused org, canceled org

**Scheduled for deletion**:
An organization whose owner deleted their account. It is inactive, unreachable for every member, and hard-deleted 30 days later. Data is kept until then.
_Avoid_: Soft-deleted, archived

**Ownership Transfer**:
The owner offering an organization to one of its members. On acceptance the recipient pays through their own Polar subscription and becomes the one owner; the old owner stays on as admin.
_Avoid_: Owner change, handover

**Customer Mode**:
The experience of a user with no active organization context: browsing businesses, viewing pages, (future) booking. Available to every user at any time, regardless of organizations owned.
_Avoid_: Personal dashboard, customer account

**Organization Mode**:
The experience inside an active organization context: dashboard, CMS/page builder, management features. Entered by selecting an organization (or landing in the last active one on login).
_Avoid_: Business mode, admin mode

**Registration Source**:
Where a user started registration (discovery platform vs business marketing page). Transient — carried only through the signup redirect (callbackURL) to pick the first post-verification destination; never persisted.
_Avoid_: CTA source, user type
