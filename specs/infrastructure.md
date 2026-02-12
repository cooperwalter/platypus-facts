# Infrastructure

Hosting, deployment, and operational concerns.

## Hosting

Raspberry Pi 5 on the local network, exposed to the internet via Cloudflare Tunnel. Bun runs as a long-lived process serving HTTP requests. SQLite database is a file on disk.

## TLS and Networking

TLS is handled by Cloudflare — the Cloudflare Tunnel terminates HTTPS and forwards plain HTTP to the Bun server on the Pi. There is **no Traefik proxy and no Let's Encrypt** — Cloudflare handles all of that. The Kamal proxy config should reflect this (SSL disabled, plain HTTP only between Cloudflare and the container).

The public domain is `https://platypus-facts.cooperwalter.dev/`.

## CI/CD — Kamal

Deployment uses [Kamal](https://kamal-deploy.org/) for Docker-based zero-downtime deploys with built-in rollback.

### Why Kamal

- Zero-downtime deploys via rolling container replacement
- Built-in rollback (`kamal rollback`) if a deploy goes wrong
- Handles container lifecycle (replaces systemd for the app process)
- Environment/secret management via `.env` files on the server
- Single `kamal deploy` command from CI or local machine

### How It Works

1. **GitHub Actions** workflow triggered on push to `main`:
   1. Run tests, type checks, and lint
   2. Build Docker image for `linux/arm64` (Pi 5 architecture) and push to GitHub Container Registry (GHCR)
   3. Run `kamal deploy` which pulls the image on the Pi, starts the new container, health-checks it, and cuts over traffic
2. The Docker image includes the application code, dependencies, and the fact sync script (which runs on container startup).

### Dockerfile

A multi-stage Dockerfile:
- **Build stage**: Install dependencies with `bun install`
- **Production stage**: Copy built artifacts into a minimal `oven/bun` image
- Must build for `linux/arm64` platform (Raspberry Pi 5)

### Configuration

Kamal is configured via `config/deploy.yml` in the repo:
- Docker image registry (GHCR)
- Pi 5 IP address on the local network (or hostname)
- Environment variables and secrets
- Health check endpoint (`GET /health`)
- Proxy with SSL disabled (Cloudflare handles TLS)

### Volumes

The SQLite database file and generated fact images must persist across deploys. Kamal supports Docker volume mounts — the database path and the `public/images/facts/` directory are mounted from the host filesystem into the container. This prevents re-generating images on every deploy.

### Health Check

The application exposes a `GET /health` endpoint that returns 200 when the server is ready. Kamal checks this before cutting traffic to the new container.

### Rollback

If a deploy introduces a bug: `kamal rollback` reverts to the previous container image immediately.

## Cron

The daily send job is scheduled via system `crontab` on the Pi at 6:00 AM Pacific time, using `CRON_TZ=America/Los_Angeles` to automatically handle daylight saving time. The cron entry executes inside the running Docker container. See `CRON_SETUP.md` for setup instructions.

## Environment Variables

| Variable               | Description                              | Example                        | Required |
| ---------------------- | ---------------------------------------- | ------------------------------ | -------- |
| `PORT`                 | HTTP server port                         | `3090`                         | No (default: 3000) |
| `BASE_URL`             | Public URL of the application            | `https://platypus-facts.cooperwalter.dev` | Yes |
| `DATABASE_PATH`        | Path to SQLite database file             | `./data/platypus-facts.db`     | No (default: `./data/platypus-facts.db`) |
| `NODE_ENV`             | Environment mode (`development` or `production`) | `production`            | No (default: `development`) |
| `BREVO_API_KEY`        | Brevo API key for sending email          | `xkeysib-...`                  | Production only |
| `EMAIL_FROM`           | Sender email address for outbound emails | `facts@platypus-facts.cooperwalter.dev` | Production only |
| `DAILY_SEND_TIME_UTC`  | Time to send daily facts (HH:MM UTC)     | `13:00`                        | No (default: 13:00) |
| `MAX_SUBSCRIBERS`      | Maximum number of active Platypus Fans   | `200`                          | No (default: 200) |
| `OPENAI_API_KEY`       | API key for AI image generation          | `sk-...`                       | No (images skipped if unset) |

In development (`NODE_ENV` unset or `development`), provider API keys (Brevo, OpenAI) are optional. When `BREVO_API_KEY` is not configured, a dev email provider is used that logs to the console and stores emails in SQLite for the dev message viewer. In production (`NODE_ENV=production`), `BREVO_API_KEY` and `EMAIL_FROM` are required and the server refuses to start without them.

### `.env.development`

A `.env.development` file is checked into the repository with working defaults for local development. The application loads this file when no `.env` file is present (or `.env` can override it). This ensures that links in dev emails (confirmation, unsubscribe, fact pages) point to the correct local address.

```
NODE_ENV=development
PORT=3090
BASE_URL=http://localhost:3090
DATABASE_PATH=./data/platypus-facts.db
```

The `.env` file (gitignored) is for production secrets and any local overrides.

## Backups

SQLite database should be backed up regularly. Options:
- Simple cron job copying the database file to a backup location
- Use Litestream for continuous SQLite replication to object storage

## Domain and TLS

- Domain: `platypus-facts.cooperwalter.dev`
- TLS is handled entirely by Cloudflare via Cloudflare Tunnel. No certificates are managed on the Pi.
- `BASE_URL` must match the public domain exactly (`https://platypus-facts.cooperwalter.dev`).
