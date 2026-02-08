# Email Integration

How the application sends emails to subscribers. Email is the sole delivery channel for Daily Platypus Facts.

## Provider Abstraction

Email functionality is accessed through a provider interface so the underlying service can be swapped without changing application logic.

The interface should support:
- **Send email**: Given a recipient email address, subject, HTML body, and optional plain-text body, send an email. Optionally accepts an `imageUrl` for emails that include the fact illustration.

## Postmark Implementation (Production)

### Sending Emails

Use the Postmark API to send transactional emails. Requires:
- API token (env: `POSTMARK_API_TOKEN`)
- Sender email address (env: `EMAIL_FROM`)

Postmark is used when `POSTMARK_API_TOKEN` is configured.

## Dev Email Provider (Development)

When `POSTMARK_API_TOKEN` is not configured, the application uses a development email provider that:

1. Logs a summary of each sent email to the console (recipient, subject).
2. Stores sent emails in the SQLite database (`dev_messages` table) so they persist across processes — messages sent by the daily-send CLI job are visible in the web server's dev message viewer.
3. Makes sent emails viewable via dev-only web routes (see Dev Message Viewer in `web-pages.md`).

No external service or API key is required.

## Email Templates

Emails are rendered as HTML using template literals (consistent with web page rendering). Each email includes a plain-text fallback body.

### Daily Fact Email

Subject: `🦆 Daily Platypus Fact`

HTML body includes:
- The AI-generated platypus illustration (as an `<img>` linking to `{base_url}/images/facts/{fact_id}.png`), if available. When no image exists for the fact, the `<img>` tag is omitted entirely — no broken image icon, no placeholder. The email layout should look complete with or without the illustration.
- The fact text
- Source links (clickable)
- "Daily Platypus Facts" branding
- "Inspired by *Life is Strange: Double Exposure*" attribution
- Unsubscribe link: `{base_url}/unsubscribe/{token}`

### Confirmation Email

Subject: `Confirm your Daily Platypus Facts subscription`

HTML body includes:
- Welcome message
- Confirmation button/link: `{base_url}/confirm/{token}`
- "Daily Platypus Facts" branding

### Already Subscribed Email

Subject: `You're already a Platypus Fan!`

Sent when an active subscriber re-enters their email on the signup form.

## Unsubscribe Header

All emails include a `List-Unsubscribe` header pointing to `{base_url}/unsubscribe/{token}` and a `List-Unsubscribe-Post` header for one-click unsubscribe support in email clients (RFC 8058).

## Cost Considerations

- Postmark pricing: ~$1.25 per 1,000 emails.
- Very affordable for transactional email volumes.
- See `cost-estimate.md` for full projections.
