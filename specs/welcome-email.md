# Welcome Email with Catch-Up Fact

When a **first-time** subscriber confirms their email, send them a welcome email containing the most recently sent platypus fact so they don't have to wait until the next daily send.

## Motivation

New subscribers currently see a confirmation page ("Welcome, Platypus Fan!") but receive nothing in their inbox until the next daily send, which could be up to 24 hours away. Sending an immediate welcome email with the latest fact creates a better first impression, confirms the subscription is working, and gives subscribers an instant taste of the content they signed up for.

## Trigger

The welcome email is sent during the confirmation flow in `renderConfirmationPage()` (in `src/routes/pages.ts`), immediately after `updateStatus()` transitions the subscriber from `pending` to `active`. It is only sent when **all** of the following are true:

1. The subscriber's status transitions from `pending` to `active` (successful confirmation).
2. The subscriber is a **first-time subscriber** (has never been confirmed before).

### First-Time vs. Returning Subscribers

A "first-time subscriber" is one who has never previously confirmed. A "returning subscriber" is one who was previously active, unsubscribed, and then re-signed up.

The distinction is determined by checking the subscriber's `confirmed_at` field **before** the `updateStatus()` call:

- **`confirmed_at` is `null`**: First-time subscriber. Send the welcome email.
- **`confirmed_at` is not `null`**: Returning subscriber (they confirmed previously). Do **not** send the welcome email.

This works because the re-subscribe flow (in `subscription-flow.ts`) clears `unsubscribed_at` but **preserves** `confirmed_at` when transitioning from `unsubscribed` → `pending`. The previous `confirmed_at` timestamp remains in the database, serving as a reliable indicator that this subscriber has been through the confirmation flow before.

The welcome email is **never** sent in these cases:
- Returning subscribers (previously confirmed, then unsubscribed and re-subscribed)
- Already-active subscribers visiting the confirmation link again
- Invalid or unsubscribed tokens
- Confirmation denied due to subscriber cap

## Fact Selection

The welcome email includes the **most recently sent daily fact** (the fact with the latest `sent_date` in the `sent_facts` table).

### New Query: `getMostRecentSentFact(db)`

Add a new function to `src/lib/facts.ts`:

```
getMostRecentSentFact(db: DrizzleDatabase): { fact_id: number; sent_date: string } | null
```

Queries `sent_facts` ordered by `sent_date DESC`, limited to 1 row. Returns `null` if no facts have been sent yet (fresh deployment). Return field names use snake_case to match the Drizzle schema column names (consistent with existing query patterns in `src/lib/facts.ts`).

### Edge Case: No Facts Sent Yet

If `getMostRecentSentFact()` returns `null` (no daily sends have occurred), the welcome email is sent **without a fact section**. The email still includes the welcome message, branding, and unsubscribe link — just no fact content. The fact section is simply omitted, not replaced with a placeholder.

## Email Template

### Subject

`Welcome to Daily Platypus Facts — Here's Your First Fact`

If no facts have been sent yet (no catch-up fact available), use the shorter subject:

`Welcome to Daily Platypus Facts!`

### New Data Interface

```typescript
interface WelcomeEmailData {
  fact: {
    text: string;
    sources: Array<{ url: string; title: string | null }>;
    imageUrl: string | null;
    factPageUrl: string;
  } | null;
  unsubscribeUrl: string;
}
```

### New Template Functions

Add to `src/lib/email-templates.ts`:

- `welcomeEmailHtml(data: WelcomeEmailData): string`
- `welcomeEmailPlain(data: WelcomeEmailData): string`

### HTML Body Structure

Uses the existing `emailWrapper()` for consistent styling and branding. Body content:

1. **Welcome message**: "Welcome to Daily Platypus Facts! You're now a Platypus Fan and will receive one fascinating platypus fact every day."
2. **Catch-up fact section** (only if `data.fact` is not null):
   - Subheading: "Here's the latest fact while you wait for tomorrow's:"
   - Fact illustration (if `imageUrl` is available), using the same `.fact-image` styling as the daily email
   - Fact text, using the same `.fact-text` styling
   - Source links
   - "View this fact on the web" CTA button linking to `factPageUrl`
3. **No-fact fallback** (when `data.fact` is null): The welcome message stands alone. No "here's the latest fact" section. No placeholder text.
4. **Footer**: Unsubscribe link, same as the daily fact email

### Plain Text Body

Follows the same structure as the HTML body but in plain text. Includes the fact text and source URLs as plain links. Omits the image.

### Email Headers

Include `List-Unsubscribe` and `List-Unsubscribe-Post` headers via the existing `unsubscribeHeaders()` helper, using the subscriber's unsubscribe URL.

## Integration Point

### Confirmation Route Changes

`renderConfirmationPage()` in `src/routes/pages.ts` currently accepts `(db, token, maxSubscribers)` and returns `Response` synchronously. It must be updated to also accept `emailProvider` and `baseUrl`, and become **async** (returning `Promise<Response>`) since email sending is awaited inside a try/catch:

```
async renderConfirmationPage(db, token, maxSubscribers, emailProvider, baseUrl): Promise<Response>
```

The corresponding route in `src/server.ts` must `await` the call. Tests that call `renderConfirmationPage` must also be updated to await the result.

After the `updateStatus()` call that confirms the subscriber, and before returning the success page:

1. Query `getMostRecentSentFact(db)` to get the latest fact ID and date.
2. If a fact exists, call `getFactWithSources(db, factId)` to get the full fact data (text, sources, image_path).
3. Construct the `WelcomeEmailData` object with:
   - `fact.imageUrl`: `${baseUrl}/${fact.image_path}` if `image_path` is not null, otherwise `null`
   - `fact.factPageUrl`: `${baseUrl}/facts/${factId}`
   - `unsubscribeUrl`: `${baseUrl}/unsubscribe/${subscriber.token}`
4. Send the email via `emailProvider.sendEmail()`.
5. Log the welcome email send (or failure).

### Failure Handling

If the welcome email fails to send (email provider error), **log the error and continue**. The confirmation page still displays the success message. A failed welcome email must never prevent the subscriber from being confirmed — the status transition has already happened. The subscriber will receive the next daily fact normally.

### Server.ts Route Update

The `createRequestHandler()` call site for the `/confirm/:token` route must pass `emailProvider` and `baseUrl` from the deps object to `renderConfirmationPage()`.

## Dev Provider Behavior

When the dev email provider is active, the welcome email is stored in the `dev_messages` table with `type: "email"` (same as all other emails), making it visible in the dev message viewer at `/dev/messages`.

## Confirmation Page Changes

The confirmation success page is updated to reflect whether a welcome email was sent:

### First-Time Subscribers

When a first-time subscriber confirms (welcome email sent):
- **Heading**: "Welcome, Platypus Fan!"
- **Body**: "You're now confirmed! Check your email for your first platypus fact."

This tells the subscriber to expect the welcome email in their inbox, giving them an immediate next action.

### Returning Subscribers

When a returning subscriber confirms (no welcome email):
- **Heading**: "Welcome, Platypus Fan!"
- **Body**: "You're now confirmed! You'll receive one fascinating platypus fact every day."

This is the original confirmation message. Returning subscribers don't receive a welcome email, so the page doesn't mention checking email.

### Email Failure

If the welcome email fails to send for a first-time subscriber, the confirmation page still shows the first-time message ("Check your email for your first platypus fact."). The email failure is logged but does not change the page content — showing the returning-subscriber message would be confusing since the user has never subscribed before.

## Testing

Tests should cover:

- Welcome email is sent when a first-time pending subscriber confirms successfully (`confirmed_at` was `null`)
- Welcome email is NOT sent when a returning subscriber confirms (`confirmed_at` was not `null`)
- Welcome email includes the most recently sent fact (text, sources, image URL, fact page URL)
- Welcome email includes unsubscribe link with the subscriber's token
- Welcome email includes List-Unsubscribe headers
- Welcome email has both HTML and plain text bodies
- When no facts have been sent yet, welcome email is sent without a fact section
- When the welcome email fails to send, the confirmation still succeeds (subscriber becomes active)
- Welcome email is NOT sent when an already-active subscriber visits the confirmation link
- Welcome email is NOT sent when the subscriber cap is reached (confirmation denied)
- Welcome email is NOT sent for unsubscribed or invalid tokens
- When multiple facts have been sent, the welcome email includes the one with the latest sent_date (not an arbitrary fact)
- Welcome email HTML contains the welcome message text and "Here's the latest fact" subheading when fact is present
- Welcome email without a fact omits the fact section entirely (no placeholder text, no empty space)
- Fact image URL is correctly constructed as `${baseUrl}/${image_path}` when image_path is present
- Fact page URL is correctly constructed as `${baseUrl}/facts/${factId}`
- First-time confirmation page says "Check your email for your first platypus fact."
- Returning subscriber confirmation page says "You'll receive one fascinating platypus fact every day."

## Rollback

To disable the welcome email without reverting the full change, remove the email-sending block after `updateStatus()` in `renderConfirmationPage()` and restore the original synchronous function signature. The confirmation flow returns to its previous behavior (status update only, no email).
