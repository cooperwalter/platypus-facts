# Cost Estimate

Estimated monthly costs at various Platypus Fan counts.

## Fixed Costs

| Item                    | Monthly Cost |
| ----------------------- | ------------ |
| VPS (Hetzner/DO)        | ~$4-6        |
| Twilio phone number     | ~$1.15       |
| Domain name             | ~$1 (amortized from ~$12/year) |
| **Fixed total**         | **~$6-8**    |

## Variable Costs (Messaging)

Daily fact messages are sent as MMS (with image) when available, or SMS (without image) as fallback.

- Twilio US outbound SMS: ~$0.0079 per segment.
- Twilio US outbound MMS: ~$0.02 per message (includes text + image, no segment splitting).

Assuming most daily messages are MMS (with image):

| Platypus Fans | Daily Cost (MMS) | Monthly Cost (30 days) |
| ----------- | ---------------- | ---------------------- |
| 10          | $0.20            | $6.00                  |
| 50          | $1.00            | $30.00                 |
| 100         | $2.00            | $60.00                 |
| 500         | $10.00           | $300.00                |

Confirmation SMS (one-time per Platypus Fan): ~$0.016 (welcome + confirmation reply). Confirmation messages remain plain SMS.

## One-Time Costs (Image Generation)

AI image generation (e.g., OpenAI DALL-E) costs ~$0.02–0.04 per image at 512x512. With 28 facts, initial generation costs ~$0.56–1.12. Additional facts incur the same per-image cost at sync time. This is a one-time cost per fact, not per subscriber.

## Total Monthly Estimates

| Platypus Fans | Estimated Monthly Total |
| ----------- | ----------------------- |
| 10          | ~$13                    |
| 50          | ~$37                    |
| 100         | ~$67                    |
| 500         | ~$307                   |

## Cost Minimization Notes

- MMS costs ~2.5x more per message than a single SMS segment, but delivers the illustration inline — a key part of the experience.
- Image generation is a one-time cost per fact (not per send), so it scales with the fact library, not the subscriber count.
- SQLite eliminates database hosting costs.
- Bun's single-binary approach keeps the VPS requirements minimal (cheapest tier sufficient).
- Images are stored locally (no CDN or object storage costs).
