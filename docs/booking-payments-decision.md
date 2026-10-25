# Booking payments decision

Which provider takes payments from an organization's customers for bookings,
and how refunds work when the organization goes inactive or its owner deletes
their account. Research only, done in October 2026 from the providers' public
docs. Nothing is built yet; the follow-up tickets at the end come in once
bookings exist.

## Decision

**Stripe Connect with direct charges**, on Accounts v2 connected accounts
with Stripe liable for losses (`losses_collector: stripe`), Stripe collecting
its own fees (`fees_collector: stripe`) and the full Stripe Dashboard
(`dashboard: full`). Each business is the merchant of its own bookings,
carries its own refunds and chargebacks, and has its own contract with Stripe.
Sinwy pays no Connect fees in this setup.

Mollie Connect for Platforms is the fallback if Stripe turns out wrong for the
market (for example, if iDEAL or Bancontact matter more than cards). Adyen for
Platforms is ruled out for now.

Polar can't do this. It is the merchant of record for Sinwy's own plans and
pays out only to Sinwy. It has no connected accounts for each business.

## Why

- **Liability stays with the business.** With direct charges and Stripe liable
  for losses, a refund or chargeback the business can't cover is between the
  business and Stripe. Sinwy carries no loss and no reserve. Destination
  charges would put every refund and dispute on Sinwy's balance.
- **No platform fees and no KYC work.** In "Stripe handles pricing", Stripe
  charges nothing per account or payout, and Stripe collects KYC through its
  hosted or embedded onboarding.
- **Lowest card price** of the three for EEA consumer cards (1.5% + €0.25,
  against Mollie's 1.8% + €0.25).
- **Self-serve.** No sales contract or minimum invoice, which matters for
  small salons and studios. Adyen needs both.
- **Refunds by API from the platform.** Sinwy can refund any direct charge
  with its own key and the `Stripe-Account` header, which both lifecycle rules
  need.

## Comparison

| | Stripe Connect (direct charges) | Mollie Connect for Platforms | Adyen for Platforms |
| --- | --- | --- | --- |
| Countries | Every country where Stripe takes payments, EU/EEA included; the account is a normal Stripe account in its own country | "Across Europe", with no published country list; some products roll out by market | Broad, including EU, UK, US and AU; sales-led |
| Onboarding | Hosted or embedded (Connect embedded components); Stripe does KYC | OAuth plus Client Links (co-branded); Mollie does KYB | Hosted onboarding via the Legal Entity Management API; individuals and sole traders supported |
| Refunds API | Platform key + `Stripe-Account`; `refund_application_fee` returns Sinwy's fee | Refunds API with the merchant's OAuth token; application fees are not refundable | Refunds with split instructions; a partial refund without splits is taken from the platform's own account |
| Refund and chargeback liability | The connected account; with `losses_collector: stripe`, Stripe absorbs what the account can't pay | The merchant; Mollie gives loss protection if the merchant can't cover it | The platform: negative balances older than 30 days are debited from the platform's compensation account |
| Fees | EEA cards 1.5% + €0.25, premium EEA 2.8% + €0.25, UK 2.5% + €0.25, international 3.15% + €0.25; dispute €20; no refund fee; fees not returned on refund; Connect fees €0 | EEA cards 1.8% + €0.25, commercial 2.9% + €0.25, non-EEA 3.25% + €0.25; iDEAL €0.32, Bancontact 1.4% + €0.25; refund and chargeback fees not on the pricing page | Interchange++ plus a per-transaction fee (about €0.10 per third-party reviews); unpublished minimum monthly invoice |
| Balance can't cover a refund | Card refund stays `pending` until the balance covers it, then fails (`insufficient_funds`) when the pending window ends; other payment methods fail at once | Refund is `queued` and runs automatically once the balance grows (payments or a top-up); no expiry is documented | Balance goes negative; after 30 days the platform pays |
| Business can cut Sinwy's access | Yes, from Dashboard → Installed Apps (fires `account.application.deauthorized`), unless platform controls restrict it | Yes, by revoking the app's token in the Mollie Dashboard | No; the platform owns the account holders |

## The two lifecycle rules

With direct charges, a refund comes out of the business's own Stripe balance,
and Stripe's payouts empty that balance on a schedule. So a refund issued
weeks after a booking was paid may have nothing to draw from.

**An inactive org's owner refunds upcoming paid bookings or handles them
off-platform.** The owner is still around and acts in the app. Sinwy issues
the refunds by API. A refund that stays `pending` is shown to the owner with
the shortfall and Stripe's top-up option. A failed refund (`refund.failed`)
falls back to "handled off-platform" for that booking, and the customer gets
an email saying the business will refund them directly. Going inactive must
not disable charges on the Stripe account; Sinwy only stops taking new
bookings.

**Owner account deletion refunds upcoming paid bookings automatically.**
Here nobody is left to top up the balance, and the org takes no new bookings
that could refill it.
- Issue every refund at the moment of deletion, while Sinwy's connection to
  the account still works and before the 30-day purge. Never defer them to
  the purge job.
- Card refunds the balance can't cover stay `pending` and fail after Stripe's
  pending window. Refunds for other payment methods fail at once. Sinwy
  doesn't cover the gap: with `losses_collector: stripe` the debt is between
  the business and Stripe. The customer gets an email that the refund failed
  and that the business owes it, with the business's contact details.
- If the business disconnected Sinwy beforehand
  (`account.application.deauthorized`), Sinwy can't refund at all; the same
  email applies.
- Keep the Stripe account id, the payment ids and the refund results until
  the refunds have settled. The purge must not delete them before then. Each
  refund has a final status (`succeeded` or `failed`) within Stripe's pending
  window, and a failed refund can come back up to 30 days after it was
  issued.

What reduces failed refunds (choose when bookings are designed):
- Take a deposit rather than the full price, so less money is at risk.
- Authorize at booking and capture later only when the appointment is within
  the card hold window (about 7 days); canceling an uncaptured payment costs
  nothing and needs no balance.
- Show the owner, in the deletion dialog, how many upcoming paid bookings
  will be refunded and the total. A deletion that the balance can't cover
  could warn. Blocking the deletion would conflict with D13, so that needs
  the product owner's decision.

Destination charges would make automatic refunds always succeed (Sinwy
refunds from its own balance, then reverses the transfer). But Sinwy would
then pay for every refund and dispute the business can't cover, must be liable
for negative balances, and pays €2 per active account a month plus payout
fees. Not worth it while bookings are small.

## Follow-up tickets (once bookings exist)

1. **Connect onboarding.** Create the Accounts v2 connected account with the
   configuration above. Embedded onboarding in org settings. Store the
   account id on the organization. Handle `account.updated` (charges enabled)
   and `account.application.deauthorized` (stop taking payments, mark the
   org's bookings as off-platform).
2. **Booking checkout.** Direct charge through Stripe Checkout with the
   `Stripe-Account` header. Decide deposit or full price, and whether Sinwy
   takes an application fee (none to start with).
3. **Refunds from an inactive org.** When the org goes inactive, the owner
   sees upcoming paid bookings and chooses, per booking or for all of them,
   "Refund" or "Handle off-platform". Track `pending` and `failed` refunds
   (`refund.updated`, `refund.failed`) and email the customer about each
   outcome.
4. **Automatic refunds on owner account deletion.** Refund every upcoming
   paid booking inside the deletion flow, before the org is scheduled.
   Record each result. Email the customer when a refund fails or can't be
   issued. The purge keeps payment and refund records until they have
   settled. The deletion dialog shows the count and the total.
5. **Webhook endpoint for Connect events.** A separate signing secret for
   events from connected accounts. Disputes are the business's to answer; the
   Payments embedded component lets them do it inside Sinwy.

## Sources

- [Stripe: integration recommendations](https://docs.stripe.com/connect/integration-recommendations)
- [Stripe: connected account configuration (Accounts v2)](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration)
- [Stripe: direct charges](https://docs.stripe.com/connect/direct-charges)
- [Stripe: refunds and disputes for SaaS platforms](https://docs.stripe.com/connect/saas/tasks/refunds-disputes)
- [Stripe: refunds](https://docs.stripe.com/refunds)
- [Stripe: what to know about direct charges](https://support.stripe.com/questions/what-should-i-know-about-using-direct-charges)
- [Stripe: Connect pricing (Ireland, EUR)](https://stripe.com/ie/connect/pricing)
- [Stripe: pricing (Ireland, EUR)](https://stripe.com/ie/pricing)
- [Stripe: OAuth and disconnecting Standard accounts](https://docs.stripe.com/connect/oauth-standard-accounts)
- [Stripe: disconnect a third-party platform](https://support.stripe.com/questions/disconnect-your-stripe-account-from-a-connected-third-party-platform)
- [Mollie: Connect overview](https://docs.mollie.com/docs/connect-overview)
- [Mollie: Connect, processing payments](https://docs.mollie.com/docs/connect-process-payments)
- [Mollie: refunds](https://docs.mollie.com/docs/refunds)
- [Mollie: topping up the balance for a refund](https://help.mollie.com/hc/en-gb/articles/115002074973-How-do-I-top-up-my-balance-for-a-refund)
- [Mollie: revoking tokens](https://docs.mollie.com/reference/revoke-tokens)
- [Mollie: pricing](https://www.mollie.com/pricing)
- [Adyen: manage liable accounts](https://docs.adyen.com/platforms/manage-liable-accounts)
- [Adyen: onboard users](https://docs.adyen.com/platforms/onboard-users)
- [Adyen: why a platform has a negative balance](https://help.adyen.com/knowledge/adyen-for-platforms/funds-transfers/why-do-i-have-a-negative-balance-on-my-platform)
- [NerdWallet: Adyen review (minimum invoice)](https://www.nerdwallet.com/business/software/learn/adyen)
