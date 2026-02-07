# Daily Platypus Facts — Project Overview

Inspired by the **Daily Platypus Facts** in [*Life is Strange: Double Exposure*](https://hardcoregamer.com/life-is-strange-double-exposure-platypus-genius-trophy/), where Max can subscribe to platypus facts via a blue flyer and receive them throughout the game (unlocking the "Platypus Genius" trophy by reading all six).

A service that sends one platypus fact per day via SMS and/or email to all confirmed Platypus Fans, ensuring every fact is shown before any are repeated.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Database**: SQLite
- **SMS Provider**: Twilio (behind a provider abstraction for future switching)
- **Email Provider**: Postmark (behind a provider abstraction for future switching)
- **Hosting**: VPS (e.g., Hetzner, DigitalOcean) with CI/CD

## High-Level Components

1. **Web application** — Signup page and individual fact display pages, served by Bun's built-in HTTP server.
2. **SMS integration** — Abstracted SMS provider for sending messages (with images via MMS) and receiving webhook replies (confirmation, STOP).
3. **Email integration** — Abstracted email provider for sending daily fact emails, confirmation emails, and handling email-based unsubscribes.
4. **Daily send job** — A scheduled cron job that selects the day's fact and sends it (with its illustration) to all active Platypus Fans via their configured channels.
5. **Fact seed data** — A JSON file in the repo containing all platypus facts with their sources.
6. **Fact illustrations** — AI-generated minimalist line drawings of a platypus, one per fact, generated at sync time and displayed on fact pages and in daily messages.
7. **CLI** — Command-line tools for manually triggering the daily send (with a dev-only `--force` flag).

## Project Attribution

The project should clearly note in its README, signup page, and initial welcome SMS that it is inspired by the Daily Platypus Facts from *Life is Strange: Double Exposure*.
