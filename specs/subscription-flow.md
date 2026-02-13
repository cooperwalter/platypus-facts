# Subscription Flow

How users subscribe, confirm, and unsubscribe from Daily Platypus Facts.

## Signup

1. User visits the signup web page and enters their email address.
2. Server validates the email (contains `@`, has a domain part).
3. Server checks the subscriber cap (see Subscriber Cap below). If the cap is reached, reject with a friendly "at capacity" message.
4. Server creates a `subscribers` row with status `pending` and a generated `token`.
5. Server sends a confirmation email with a confirmation link.
6. Server returns a success page telling the user to check their email.

### Existing Subscriber Lookup

When a user signs up with an email that matches an existing subscriber:

- **Status `pending`**: Resend confirmation email. (Does not count against the cap since the row already exists.)
- **Status `active`**: Inform the user they are already a Platypus Fan via the web page. Send the "already subscribed" email.
- **Status `unsubscribed`**: Reset to `pending`, resend confirmation email. (Does not count against the cap since the row already exists.)

## Confirmation

The confirmation email includes a link: `{base_url}/confirm/{token}`.

When the user clicks the link:
1. `GET /confirm/{token}` — Look up the subscriber by token.
2. If status is `pending`:
   - Check the subscriber cap. If the cap has been reached, display a "sorry, we're at capacity" page.
   - Otherwise, update status to `active`, set `confirmed_at`.
   - If this is a **first-time subscriber** (`confirmed_at` was `null` before the update): send a welcome email with the most recent platypus fact (see `welcome-email.md`) and display a confirmation page telling them to check their email.
   - If this is a **returning subscriber** (`confirmed_at` was not `null` — they previously confirmed, then unsubscribed and re-signed up): skip the welcome email and display the standard confirmation success page.
3. If status is `active`: Display "You're already confirmed!" page.
4. If status is `unsubscribed` or token not found: Display an appropriate message.

## Unsubscribe

Every email includes an unsubscribe link: `{base_url}/unsubscribe/{token}`.

When the user clicks the link:
1. `GET /unsubscribe/{token}` — Display a confirmation page: "Are you sure you want to unsubscribe?"
2. User clicks the confirm button → `POST /unsubscribe/{token}`.
3. Update status to `unsubscribed`, set `unsubscribed_at`.
4. Display a success page: "You've been unsubscribed."

Emails also include `List-Unsubscribe` and `List-Unsubscribe-Post` headers for one-click unsubscribe in email clients that support it (RFC 8058).

## Re-subscribing

The only way to re-subscribe after unsubscribing is to visit the website and enter an email address again. This starts the full signup flow from the beginning (status reset to `pending`, new confirmation email sent).

## Email Templates

See `email-integration.md` for full email template details (confirmation, daily fact, already subscribed, welcome). See `welcome-email.md` for the welcome email sent on confirmation.

## Subscriber Cap

The total number of active Platypus Fans is capped to control costs. Configured via the `MAX_SUBSCRIBERS` environment variable (default: `200`).

The cap is checked at two points:
1. **At signup** (step 3): If active Platypus Fan count >= `MAX_SUBSCRIBERS`, reject the signup with a friendly message. The signup page should also visually indicate when the service is at capacity.
2. **At confirmation** (email link): If the cap was reached between signup and confirmation, inform the user they can't be confirmed right now.

The cap counts only `active` Platypus Fans (not `pending` or `unsubscribed`). When a Platypus Fan unsubscribes, a slot opens up.

## Rate Limiting

The signup endpoint is rate-limited per IP address to prevent abuse. Suggested limit: 5 signup attempts per IP per hour. The double opt-in itself also serves as a natural abuse prevention mechanism since unconfirmed contacts never receive daily messages.
