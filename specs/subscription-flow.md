# Subscription Flow

How users subscribe, confirm, and unsubscribe from Daily Platypus Facts.

## Signup

1. User visits the signup web page and enters their phone number.
2. Server validates the phone number format and normalizes to E.164.
3. Server checks the subscriber cap (see Subscriber Cap below). If the cap is reached, reject with a friendly "at capacity" message.
4. Server creates a `subscribers` row with status `pending`.
5. Server sends a welcome/confirmation SMS (see message template below).
6. Server returns a success page telling the user to check their phone.

If the phone number already exists:
- **Status `pending`**: Resend the confirmation SMS. (Does not count against the cap since the row already exists.)
- **Status `active`**: Inform the user they are already a Platypus Fan. (Does not count against the cap.)
- **Status `unsubscribed`**: Reset to `pending`, resend confirmation SMS. (Does not count against the cap since the row already exists.)

## Double Opt-In Confirmation

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

## Unsubscribe

Platypus Fans unsubscribe by replying `STOP` to any received SMS. Twilio handles this at the carrier/account level. The application should also handle the Twilio opt-out webhook to update the subscriber's status in the database.

## Re-subscribing

The only way to re-subscribe after unsubscribing is to visit the website and enter the phone number again. This starts the full signup flow from the beginning (status reset to `pending`, new confirmation SMS sent). Texting any keyword — including `1`, `PERRY`, or `START` — does NOT re-subscribe a user.

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

## Platypus Fan Cap

The total number of active Platypus Fans is capped to control SMS costs. Configured via the `MAX_SUBSCRIBERS` environment variable (default: `1000`).

The cap is checked at two points:
1. **At signup** (step 3): If active Platypus Fan count >= `MAX_SUBSCRIBERS`, reject the signup with a friendly message. The signup page should also visually indicate when the service is at capacity.
2. **At confirmation** (webhook): If the cap was reached between signup and confirmation, reply with a "sorry, we're at capacity" SMS.

The cap counts only `active` Platypus Fans (not `pending` or `unsubscribed`). When a Platypus Fan unsubscribes, a slot opens up.

## SMS Message Templates

**At Capacity (signup rejected on web):**
Displayed on the web page, not sent via SMS.

**At Capacity (confirmation rejected via SMS):**
> Sorry, Daily Platypus Facts is currently at capacity! We can't confirm your subscription right now. Please try again later.

## Rate Limiting

The signup endpoint is rate-limited per IP address to prevent abuse. Suggested limit: 5 signup attempts per IP per hour. The double opt-in itself also serves as a natural abuse prevention mechanism since unconfirmed numbers never receive daily messages.
