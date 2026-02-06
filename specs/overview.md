# Daily Platypus Facts — Project Overview

Inspired by the **Daily Platypus Facts** in [*Life is Strange: Double Exposure*](https://hardcoregamer.com/life-is-strange-double-exposure-platypus-genius-trophy/), where Max can subscribe to platypus facts via a blue flyer and receive them throughout the game (unlocking the "Platypus Genius" trophy by reading all six).

A service that sends one platypus fact per day via SMS to all confirmed Platypus Fans, ensuring every fact is shown before any are repeated.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Database**: SQLite
- **SMS Provider**: Twilio (behind a provider abstraction for future switching)
- **Hosting**: VPS (e.g., Hetzner, DigitalOcean) with CI/CD

## High-Level Components

1. **Web application** — Signup page and individual fact display pages, served by Bun's built-in HTTP server.
2. **SMS integration** — Abstracted SMS provider for sending messages and receiving webhook replies (confirmation, STOP).
3. **Daily send job** — A scheduled cron job that selects the day's fact and sends it to all active Platypus Fans.
4. **Fact seed data** — A JSON file in the repo containing all platypus facts with their sources.

## Project Attribution

The project should clearly note in its README, signup page, and initial welcome SMS that it is inspired by the Daily Platypus Facts from *Life is Strange: Double Exposure*.
