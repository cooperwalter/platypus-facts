# Cost Estimate

Estimated monthly costs at various Platypus Fan counts.

## Fixed Costs

| Item                    | Monthly Cost |
| ----------------------- | ------------ |
| VPS (Hetzner/DO)        | ~$4-6        |
| Twilio phone number     | ~$1.15       |
| Domain name             | ~$1 (amortized from ~$12/year) |
| **Fixed total**         | **~$6-8**    |

## Variable Costs (SMS)

Twilio US outbound SMS: ~$0.0079 per segment.

Assuming most daily fact messages fit in 1 SMS segment (≤160 chars GSM-7):

| Platypus Fans | Daily Cost | Monthly Cost (30 days) |
| ----------- | ---------- | ---------------------- |
| 10          | $0.08      | $2.37                  |
| 50          | $0.40      | $11.85                 |
| 100         | $0.79      | $23.70                 |
| 500         | $3.95      | $118.50                |

Confirmation SMS (one-time per Platypus Fan): ~$0.016 (welcome + confirmation reply).

## Total Monthly Estimates

| Platypus Fans | Estimated Monthly Total |
| ----------- | ----------------------- |
| 10          | ~$9                     |
| 50          | ~$19                    |
| 100         | ~$31                    |
| 500         | ~$126                   |

## Cost Minimization Notes

- Keep fact text concise to avoid multi-segment messages (each additional segment doubles the per-message cost).
- SQLite eliminates database hosting costs.
- Bun's single-binary approach keeps the VPS requirements minimal (cheapest tier sufficient).
- No third-party services beyond Twilio and hosting.
