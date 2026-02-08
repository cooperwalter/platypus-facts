# Cost Estimate

Estimated monthly costs at various Platypus Fan counts.

## Fixed Costs

| Item                    | Monthly Cost |
| ----------------------- | ------------ |
| Raspberry Pi 5          | ~$0 (one-time purchase) |
| Domain name             | ~$1 (amortized from ~$12/year) |
| Cloudflare Tunnel       | Free         |
| **Fixed total**         | **~$1**      |

## Variable Costs (Email)

- Postmark pricing: ~$1.25 per 1,000 emails.
- Confirmation emails are one-time per subscriber.

| Subscribers | Daily Cost | Monthly Cost (30 days) |
| ----------- | ---------- | ---------------------- |
| 10          | $0.01      | $0.38                  |
| 50          | $0.06      | $1.88                  |
| 100         | $0.13      | $3.75                  |
| 500         | $0.63      | $18.75                 |

## One-Time Costs (Image Generation)

AI image generation (OpenAI DALL-E 3) costs ~$0.04 per image at 1024x1024 (the minimum size for DALL-E 3). With 28 facts, initial generation costs ~$1.12. Additional facts incur the same per-image cost at sync time. This is a one-time cost per fact, not per subscriber.

## Total Monthly Estimates

| Platypus Fans | Estimated Monthly Total |
| ------------- | ----------------------- |
| 10            | ~$1.50                  |
| 50            | ~$3                     |
| 100           | ~$5                     |
| 500           | ~$20                    |

## Cost Minimization Notes

- Email is very cheap per message (~$0.00125 each).
- Image generation is a one-time cost per fact (not per send), so it scales with the fact library, not the subscriber count.
- SQLite eliminates database hosting costs.
- Bun's single-binary approach keeps the Pi 5 requirements minimal.
- Images are stored locally (no CDN or object storage costs).
- No SMS/MMS costs — email-only delivery keeps per-subscriber costs minimal.
