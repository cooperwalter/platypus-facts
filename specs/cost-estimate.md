# Cost Estimate

Estimated monthly costs at various Platypus Fan counts. Actual costs depend on the mix of SMS-only, email-only, and dual-channel subscribers.

## Fixed Costs

| Item                    | Monthly Cost |
| ----------------------- | ------------ |
| VPS (Hetzner/DO)        | ~$4-6        |
| Twilio phone number     | ~$1.15       |
| Domain name             | ~$1 (amortized from ~$12/year) |
| **Fixed total**         | **~$6-8**    |

## Variable Costs (SMS/MMS)

Daily fact messages are sent as MMS (with image) when available, or SMS (without image) as fallback.

- Twilio US outbound SMS: ~$0.0079 per segment.
- Twilio US outbound MMS: ~$0.02 per message (includes text + image, no segment splitting).

Assuming most daily messages are MMS (with image), costs per SMS subscriber:

| SMS Subscribers | Daily Cost (MMS) | Monthly Cost (30 days) |
| --------------- | ---------------- | ---------------------- |
| 10              | $0.20            | $6.00                  |
| 50              | $1.00            | $30.00                 |
| 100             | $2.00            | $60.00                 |
| 500             | $10.00           | $300.00                |

Confirmation SMS (one-time per phone subscriber): ~$0.016 (welcome + confirmation reply).

## Variable Costs (Email)

- Postmark pricing: ~$1.25 per 1,000 emails.
- Confirmation emails are one-time per email subscriber.

| Email Subscribers | Daily Cost | Monthly Cost (30 days) |
| ----------------- | ---------- | ---------------------- |
| 10                | $0.01      | $0.38                  |
| 50                | $0.06      | $1.88                  |
| 100               | $0.13      | $3.75                  |
| 500               | $0.63      | $18.75                 |

## One-Time Costs (Image Generation)

AI image generation (OpenAI DALL-E 3) costs ~$0.04 per image at 1024x1024 (the minimum size for DALL-E 3). With 28 facts, initial generation costs ~$1.12. Additional facts incur the same per-image cost at sync time. This is a one-time cost per fact, not per subscriber.

## Total Monthly Estimates

Estimates assume all subscribers use both channels (worst case). Real costs will be lower if some are email-only.

| Platypus Fans | Estimated Monthly Total |
| ------------- | ----------------------- |
| 10            | ~$13                    |
| 50            | ~$39                    |
| 100           | ~$71                    |
| 500           | ~$326                   |

Email-only subscribers are dramatically cheaper (~$0.04/month each vs ~$0.60/month each for MMS).

## Cost Minimization Notes

- Email is ~15x cheaper per message than MMS. Subscribers who choose email-only significantly reduce costs.
- MMS costs ~2.5x more per message than a single SMS segment, but delivers the illustration inline.
- Image generation is a one-time cost per fact (not per send), so it scales with the fact library, not the subscriber count.
- SQLite eliminates database hosting costs.
- Bun's single-binary approach keeps the VPS requirements minimal (cheapest tier sufficient).
- Images are stored locally (no CDN or object storage costs).
