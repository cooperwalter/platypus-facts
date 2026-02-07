# Subscription Flow

How users subscribe, confirm, and unsubscribe from Daily Platypus Facts.

## Signup

1. User visits the signup web page and enters a phone number, email address, or both.
2. Server validates the provided inputs:
   - Phone number: validated and normalized to E.164 (see `phone-validation.md`).
   - Email: validated for basic format (contains `@`, has a domain part).
   - At least one of phone or email must be provided.
3. Server checks the subscriber cap (see Subscriber Cap below). If the cap is reached, reject with a friendly "at capacity" message.
4. Server creates a `subscribers` row with status `pending` and a generated `token`.
5. Server sends confirmation message(s) via the provided channel(s):
   - If phone provided: sends confirmation SMS.
   - If email provided: sends confirmation email with a confirmation link.
6. Server returns a success page telling the user to check their phone and/or email.

### Existing Subscriber Lookup

When a user signs up with contact info that matches an existing subscriber:

1. **Lookup by phone** (if phone provided): If a subscriber with that phone exists, that is the matched record. Update the email on the record to whatever was provided (add, change, or clear).
2. **Lookup by email** (if email provided and no phone match): If a subscriber with that email exists, that is the matched record. Update the phone on the record to whatever was provided (add, change, or clear).
3. **Conflict** (phone matches subscriber A, email matches subscriber B): Reject with an error message: "This contact info is associated with different accounts. Please use the same phone number and email you originally signed up with, or sign up with just one."
4. **No match**: Create a new subscriber.

### Existing Subscriber Status Handling

When a matched existing subscriber is found:
- **Status `pending`**: Update contact info, resend confirmation(s). (Does not count against the cap since the row already exists.)
- **Status `active`**: Inform the user they are already a Platypus Fan via the web page. If they provided a phone, send the "already subscribed" SMS. If they provided an email, send the "already subscribed" email. (Does not count against the cap.)
- **Status `unsubscribed`**: Update contact info, reset to `pending`, resend confirmation(s). (Does not count against the cap since the row already exists.)

## Double Opt-In Confirmation

A subscriber can confirm via **either** channel. Confirming via one channel activates the subscription for **all** provided channels.

### Via SMS

The confirmation SMS includes instructions to reply with either:
- `1` (standard confirmation)
- `PERRY` (case-insensitive, a nod to Perry the Platypus)

When the Twilio incoming message webhook receives a reply:
1. Look up the subscriber by phone number.
2. If status is `pending` and the message body (trimmed, case-insensitive) is `1` or `PERRY`:
   - Check the subscriber cap. If the cap has been reached since the user signed up, reply with a "sorry, we're at capacity" SMS and leave their status as `pending`.
   - Otherwise, update status to `active`, set `confirmed_at`.
   - Send a confirmation success SMS.
3. If status is `unsubscribed`:
   - Do NOT re-subscribe them regardless of what they text.
   - Reply with a message directing them to the website to re-subscribe.
4. If the message body is `STOP` (or any Twilio-recognized stop word):
   - Twilio handles opt-out automatically at the carrier level.
   - Update status to `unsubscribed`, set `unsubscribed_at`.
5. Any other message: reply with a help message explaining valid responses.

**Twilio START keyword**: Twilio's Advanced Opt-Out may re-opt-in a user at the carrier level when they text `START`. This only affects whether Twilio will deliver messages to the number — it does NOT change the subscriber's status in our database. Since the application only sends daily facts to subscribers with `active` status, a carrier-level re-opt-in alone will not cause them to receive facts. They must re-subscribe through the website.

### Via Email

The confirmation email includes a link: `{base_url}/confirm/{token}`.

When the user clicks the link:
1. `GET /confirm/{token}` — Look up the subscriber by token.
2. If status is `pending`:
   - Check the subscriber cap. If the cap has been reached, display a "sorry, we're at capacity" page.
   - Otherwise, update status to `active`, set `confirmed_at`.
   - Display a confirmation success page.
3. If status is `active`: Display "You're already confirmed!" page.
4. If status is `unsubscribed` or token not found: Display an appropriate message.

## Unsubscribe

Unsubscribing via any channel unsubscribes the subscriber from **all** channels. This keeps the model simple — one subscriber, one status.

### Via SMS

Platypus Fans unsubscribe by replying `STOP` to any received SMS. Twilio handles this at the carrier/account level. The application should also handle the Twilio opt-out webhook to update the subscriber's status in the database.

### Via Email

Every email includes an unsubscribe link: `{base_url}/unsubscribe/{token}`.

When the user clicks the link:
1. `GET /unsubscribe/{token}` — Display a confirmation page: "Are you sure you want to unsubscribe?"
2. User clicks the confirm button → `POST /unsubscribe/{token}`.
3. Update status to `unsubscribed`, set `unsubscribed_at`.
4. Display a success page: "You've been unsubscribed."

Emails also include `List-Unsubscribe` and `List-Unsubscribe-Post` headers for one-click unsubscribe in email clients that support it (RFC 8058).

## Re-subscribing

The only way to re-subscribe after unsubscribing is to visit the website and enter contact info again. This starts the full signup flow from the beginning (status reset to `pending`, new confirmation message(s) sent). Texting any keyword — including `1`, `PERRY`, or `START` — does NOT re-subscribe a user.

## SMS Message Templates

**Welcome / Confirmation Request:**
> Welcome to Daily Platypus Facts! Inspired by Life is Strange: Double Exposure. 🦆
> Reply 1 or PERRY to confirm and start receiving a platypus fact every day.

**Confirmation Success:**
> You're now a Platypus Fan! You'll receive one platypus fact every day. Reply STOP at any time to unsubscribe.

**Already a Platypus Fan (sent via SMS only if re-registering while active):**
> You're already a Platypus Fan! Reply STOP to unsubscribe.

**Unsubscribed User Texts In:**
> You've unsubscribed from Daily Platypus Facts. To re-subscribe, visit {base_url}

**Help (unrecognized reply):**
> Daily Platypus Facts: Reply 1 or PERRY to confirm your subscription. Reply STOP to unsubscribe.

## Email Templates

See `email-integration.md` for full email template details (confirmation, daily fact, already subscribed).

## Platypus Fan Cap

The total number of active Platypus Fans is capped to control costs. Configured via the `MAX_SUBSCRIBERS` environment variable (default: `1000`).

The cap is checked at two points:
1. **At signup** (step 3): If active Platypus Fan count >= `MAX_SUBSCRIBERS`, reject the signup with a friendly message. The signup page should also visually indicate when the service is at capacity.
2. **At confirmation** (SMS webhook or email link): If the cap was reached between signup and confirmation, inform the user they can't be confirmed right now.

The cap counts only `active` Platypus Fans (not `pending` or `unsubscribed`). When a Platypus Fan unsubscribes, a slot opens up.

## SMS Message Templates

**At Capacity (signup rejected on web):**
Displayed on the web page, not sent via SMS.

**At Capacity (confirmation rejected via SMS):**
> Sorry, Daily Platypus Facts is currently at capacity! We can't confirm your subscription right now. Please try again later.

## Rate Limiting

The signup endpoint is rate-limited per IP address to prevent abuse. Suggested limit: 5 signup attempts per IP per hour. The double opt-in itself also serves as a natural abuse prevention mechanism since unconfirmed contacts never receive daily messages.
