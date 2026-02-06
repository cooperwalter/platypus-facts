# SMS Integration

How the application sends and receives SMS messages.

## Provider Abstraction

The SMS functionality is accessed through a provider interface so the underlying service (Twilio initially) can be swapped without changing application logic.

The interface should support:
- **Send SMS**: Given a phone number and message body, send an SMS.
- **Incoming message webhook handler**: Parse incoming SMS replies from the provider's webhook format.

## Twilio Implementation

### Sending Messages

Use the Twilio REST API to send SMS. Requires:
- Account SID (env: `TWILIO_ACCOUNT_SID`)
- Auth Token (env: `TWILIO_AUTH_TOKEN`)
- Sending phone number (env: `TWILIO_PHONE_NUMBER`)

### Receiving Messages (Webhooks)

Configure the Twilio phone number's incoming message webhook to point to the application's webhook endpoint (e.g., `POST /api/webhooks/twilio/incoming`).

The webhook handler:
1. Validates the request signature using Twilio's `X-Twilio-Signature` header to prevent spoofing.
2. Extracts the sender's phone number (`From`) and message body (`Body`).
3. Delegates to the subscription flow logic for processing.
4. Returns TwiML response (empty `<Response/>` or with a `<Message>` for reply).

### Opt-Out Handling

Twilio's Advanced Opt-Out handles STOP/START/HELP keywords at the carrier level. Additionally, configure the account's opt-out webhook to update subscriber status in the database.

## Daily Fact SMS Format

The daily fact SMS includes the fact text and a link to the fact's web page (which shows the full fact with sources).

> 🦆 Daily Platypus Fact:
> {fact_text}
>
> Sources: {base_url}/facts/{fact_id}

The linked page displays the fact with all its sources. This keeps the SMS concise while making sources accessible.

## Cost Considerations

- Twilio SMS pricing: ~$0.0079 per outbound SMS segment (US).
- Messages over 160 characters (GSM-7) or 70 characters (UCS-2/emoji) are split into multiple segments.
- Keep fact text + message framing under 160 characters when possible to minimize multi-segment messages.
- Twilio phone number: ~$1.15/month.
