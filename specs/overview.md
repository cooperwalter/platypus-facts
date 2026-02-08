# Daily Platypus Facts — Project Overview

Inspired by the **Daily Platypus Facts** in [*Life is Strange: Double Exposure*](https://hardcoregamer.com/life-is-strange-double-exposure-platypus-genius-trophy/), where Max can subscribe to platypus facts via a blue flyer and receive them throughout the game (unlocking the "Platypus Genius" trophy by reading all six).

A service that sends one platypus fact per day via email to all confirmed Platypus Fans, ensuring every fact is shown before any are repeated.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Database**: SQLite
- **Email Provider**: Postmark (behind a provider abstraction for future switching)
- **Hosting**: Raspberry Pi 5 with Kamal deploys and Cloudflare Tunnel

## High-Level Components

1. **Web application** — Signup page and individual fact display pages, served by Bun's built-in HTTP server.
2. **Email integration** — Abstracted email provider for sending daily fact emails, confirmation emails, and handling unsubscribes.
3. **Daily send job** — A scheduled cron job that selects the day's fact and sends it (with its illustration) to all active Platypus Fans via email.
4. **Fact seed data** — A JSON file in the repo containing all platypus facts with their sources.
5. **Fact illustrations** — AI-generated minimalist line drawings of a platypus, one per fact, generated at sync time and displayed on fact pages and in daily emails.
6. **CLI** — Command-line tools for manually triggering the daily send (with a dev-only `--force` flag).

## Architecture Diagram

An architecture diagram (`ARCHITECTURE.md` in the repo root) must be maintained that visually represents the system's components and their relationships. The diagram should be kept up to date as the system evolves — any change that adds, removes, or restructures a component should include a corresponding diagram update.

## Platypus Emoji

Since there is no platypus emoji in Unicode, the platypus is represented using the combination 🦫+🦆+🥚 wherever emoji are appropriate (README, documentation, commit messages, etc.).

## Project Attribution

The project should clearly note in its README, signup page, and welcome email that it is inspired by the Daily Platypus Facts from *Life is Strange: Double Exposure*.
