# Email Integration

How the application sends emails to subscribers. Email is the sole delivery channel for Daily Platypus Facts.

## Provider Abstraction

Email functionality is accessed through a provider interface so the underlying service can be swapped without changing application logic.

The interface should support:
- **Send email**: Given a recipient email address, subject, HTML body, and optional plain-text body, send an email. Optionally accepts an `imageUrl` for emails that include the fact illustration.

## Brevo Implementation (Production)

### Sending Emails

Use the [Brevo transactional email API](https://developers.brevo.com/docs/send-a-transactional-email) to send emails. `POST https://api.brevo.com/v3/smtp/email` with `api-key` header for authentication.

Requires:
- API key (env: `BREVO_API_KEY`)
- Sender email address (env: `EMAIL_FROM`)

Request body includes `sender` (object with `name` and `email`), `to` (array of recipient objects), `subject`, and `htmlContent`. Optional `textContent` for plain-text body. Optional `headers` object for custom headers (e.g., `List-Unsubscribe`).

Brevo is used when `BREVO_API_KEY` is configured.

## Dev Email Provider (Development)

When `BREVO_API_KEY` is not configured, the application uses a development email provider that:

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

- Brevo free tier: 300 emails/day (~9,000/month). Starter plan: $9/month for 5,000 emails.
- Prepaid credits: ~$0.006/email (5k pack) down to ~$0.002/email (500k+ pack).
- See `cost-estimate.md` for full projections.
