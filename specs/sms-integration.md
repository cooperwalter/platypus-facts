# SMS Integration

How the application sends and receives SMS messages.

## Provider Abstraction

The SMS functionality is accessed through a provider interface so the underlying service (Twilio initially) can be swapped without changing application logic.

The interface should support:
- **Send message**: Given a phone number, message body, and an optional image URL, send an SMS or MMS.
- **Incoming message webhook handler**: Parse incoming SMS replies from the provider's webhook format.

## Twilio Implementation (Production)

### Sending Messages

Use the Twilio REST API to send SMS. Requires:
- Account SID (env: `TWILIO_ACCOUNT_SID`)
- Auth Token (env: `TWILIO_AUTH_TOKEN`)
- Sending phone number (env: `TWILIO_PHONE_NUMBER`)

Twilio is used when all three Twilio environment variables are configured.

## Dev SMS Provider (Development)

When Twilio environment variables are not configured, the application uses a development SMS provider that:

1. Logs a summary of each sent message to the console (recipient, body preview).
2. Stores sent messages in the SQLite database (`dev_messages` table) so they persist across processes — messages sent by the daily-send CLI job are visible in the web server's dev message viewer.
3. Makes sent messages viewable via the dev message viewer (see `web-pages.md`).

No external service or API key is required for development.

### Receiving Messages (Webhooks)

Configure the Twilio phone number's incoming message webhook to point to the application's webhook endpoint (e.g., `POST /api/webhooks/twilio/incoming`).

The webhook handler:
1. Validates the request signature using Twilio's `X-Twilio-Signature` header to prevent spoofing.
2. Extracts the sender's phone number (`From`) and message body (`Body`).
3. Delegates to the subscription flow logic for processing.
4. Returns TwiML response (empty `<Response/>` or with a `<Message>` for reply).

### Opt-Out Handling

Twilio's Advanced Opt-Out handles STOP/START/HELP keywords at the carrier level. Additionally, configure the account's opt-out webhook to update subscriber status in the database.

## Daily Fact Message Format

The daily fact message is sent as an **MMS** (Multimedia Messaging Service) when the fact has a generated illustration, or as a plain SMS if no image is available.

### MMS (with image)

The message includes the fact text, a link to the fact's web page, and the fact's AI-generated platypus illustration as a media attachment.

> 🦆 Daily Platypus Fact:
> {fact_text}
>
> Sources: {base_url}/facts/{fact_id}

The image is attached via its publicly accessible URL (`{base_url}/images/facts/{fact_id}.png`). Twilio's MMS API accepts a `MediaUrl` parameter for this.

### SMS fallback (no image)

If a fact does not have a generated image (`image_path` is NULL), the message is sent as a plain SMS with the same text format above. No `MediaUrl` parameter is included — the message is text-only and delivers as a standard SMS.

## Cost Considerations

- Twilio SMS pricing: ~$0.0079 per outbound SMS segment (US).
- Twilio MMS pricing: ~$0.02 per outbound MMS (US). MMS messages are not split into segments — a single MMS can include text + image.
- When an image is available, MMS is used. Although MMS costs more per message than a single SMS segment (~$0.02 vs ~$0.008), it avoids multi-segment concerns and delivers the illustration inline.
- When no image is available, plain SMS is used at the standard rate.
- Twilio phone number: ~$1.15/month.
- See `cost-estimate.md` for full cost projections with MMS pricing.
