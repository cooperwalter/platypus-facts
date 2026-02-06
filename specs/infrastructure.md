# Infrastructure

Hosting, deployment, and operational concerns.

## Hosting

VPS (e.g., Hetzner or DigitalOcean, ~$4-6/month). Bun runs as a long-lived process serving HTTP requests. SQLite database is a file on disk.

## CI/CD — Kamal

Deployment uses [Kamal](https://kamal-deploy.org/) for Docker-based zero-downtime deploys with built-in rollback.

### Why Kamal

- Zero-downtime deploys via rolling container replacement
- Built-in rollback (`kamal rollback`) if a deploy goes wrong
- Manages SSL via Traefik proxy (replaces Caddy)
- Handles container lifecycle (replaces systemd for the app process)
- Environment/secret management via `.env` files on the server
- Single `kamal deploy` command from CI or local machine

### How It Works

1. **GitHub Actions** workflow triggered on push to `main`:
   1. Run tests and type checks
   2. Build Docker image and push to GitHub Container Registry (GHCR)
   3. Run `kamal deploy` which pulls the image on the VPS, starts the new container, health-checks it, and cuts over traffic
2. The Docker image includes the application code, dependencies, and the fact sync script (which runs on container startup).
3. Kamal's Traefik proxy handles TLS termination via Let's Encrypt (replaces the need for a separate Caddy setup).

### Dockerfile

A multi-stage Dockerfile:
- **Build stage**: Install dependencies with `bun install`
- **Production stage**: Copy built artifacts into a minimal `oven/bun` image

### Configuration

Kamal is configured via `config/deploy.yml` in the repo:
- Docker image registry (GHCR)
- Server IP address(es)
- Environment variables and secrets
- Health check endpoint (e.g., `GET /health`)
- Traefik configuration for SSL

### Volumes

The SQLite database file and generated fact images must persist across deploys. Kamal supports Docker volume mounts — the database path and the `public/images/facts/` directory are mounted from the host filesystem into the container. This prevents re-generating images on every deploy.

### Health Check

The application exposes a `GET /health` endpoint that returns 200 when the server is ready. Kamal checks this before cutting traffic to the new container.

### Rollback

If a deploy introduces a bug: `kamal rollback` reverts to the previous container image immediately.

## Cron

The daily send job is scheduled via system `crontab` on the VPS. The cron entry is provisioned as part of deployment setup.

## Environment Variables

| Variable               | Description                              | Example                        |
| ---------------------- | ---------------------------------------- | ------------------------------ |
| `PORT`                 | HTTP server port                         | `3000`                         |
| `BASE_URL`             | Public URL of the application            | `https://platypusfacts.example.com` |
| `DATABASE_PATH`        | Path to SQLite database file             | `./data/platypus-facts.db`     |
| `TWILIO_ACCOUNT_SID`   | Twilio account SID                       | `AC...`                        |
| `TWILIO_AUTH_TOKEN`     | Twilio auth token                        | `...`                          |
| `TWILIO_PHONE_NUMBER`  | Twilio sending phone number (E.164)      | `+15551234567`                 |
| `DAILY_SEND_TIME_UTC`  | Time to send daily facts (HH:MM UTC)     | `14:00`                        |
| `MAX_SUBSCRIBERS`      | Maximum number of active Platypus Fans   | `1000`                         |
| `OPENAI_API_KEY`       | API key for AI image generation           | `sk-...`                       |

## Backups

SQLite database should be backed up regularly. Options:
- Simple cron job copying the database file to a backup location
- Use Litestream for continuous SQLite replication to object storage

## Domain and TLS

- A domain is needed for the public-facing web pages and Twilio webhook URL.
- TLS via Let's Encrypt is handled automatically by Kamal's built-in Traefik proxy.
