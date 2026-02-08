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

- Brevo free tier: 300 emails/day (~9,000/month) — sufficient for up to ~300 daily subscribers at no cost.
- Starter plan: $9/month for 5,000 emails/month. Prepaid credits: ~$0.006/email (5k pack) to ~$0.002/email (500k+ pack).
- Confirmation emails are one-time per subscriber.

| Subscribers | Daily Emails | Monthly Emails | Monthly Cost |
| ----------- | ------------ | -------------- | ------------ |
| 10          | 10           | 300            | $0 (free tier) |
| 50          | 50           | 1,500          | $0 (free tier) |
| 100         | 100          | 3,000          | $0 (free tier) |
| 300         | 300          | 9,000          | $0 (free tier) |
| 500         | 500          | 15,000         | $9 (Starter plan) |

## One-Time Costs (Image Generation)

AI image generation (OpenAI DALL-E 3) costs ~$0.04 per image at 1024x1024 (the minimum size for DALL-E 3). With 28 facts, initial generation costs ~$1.12. Additional facts incur the same per-image cost at sync time. This is a one-time cost per fact, not per subscriber.

## Total Monthly Estimates

| Platypus Fans | Estimated Monthly Total |
| ------------- | ----------------------- |
| 10            | ~$1                     |
| 50            | ~$1                     |
| 100           | ~$1                     |
| 300           | ~$1                     |
| 500           | ~$10                    |

## Cost Minimization Notes

- Email is free for up to ~300 daily subscribers via Brevo's free tier (300 emails/day).
- Image generation is a one-time cost per fact (not per send), so it scales with the fact library, not the subscriber count.
- SQLite eliminates database hosting costs.
- Bun's single-binary approach keeps the Pi 5 requirements minimal.
- Images are stored locally (no CDN or object storage costs).
- No SMS/MMS costs — email-only delivery keeps per-subscriber costs minimal.
- Brevo's free tier means email costs nothing until the subscriber base exceeds ~300.
