# Design Decisions

A record of key decisions made during the specification phase.

## Fact Cycling: Global (not per-Platypus Fan)

All Platypus Fans receive the same fact on any given day, regardless of when they signed up. A new Platypus Fan joining on day 50 gets the same fact as someone who joined on day 1. This simplifies the data model (one `sent_facts` table instead of per-fan tracking) and keeps costs predictable.

## Fact Cycling: Re-randomize each cycle

When all facts have been sent and a new cycle begins, the order is randomized again rather than replaying the same sequence. This keeps the experience fresh for long-term Platypus Fans.

## New facts take priority

Any fact that has never been sent globally is sent before continuing the current cycle. This ensures new content reaches Platypus Fans as soon as possible.

## Sources: Linked web page (not inline in email)

Each daily email includes a link to a web page that displays the fact with its full sources. This keeps the email clean while still making sources accessible and verifiable.

## Fact management: Seed file in repo

Facts are maintained in a `data/facts.json` file rather than through an admin UI. This keeps the project simple, provides version history via git, and avoids building authentication for an admin interface.

## Email-only delivery

The service delivers facts exclusively via email. This keeps costs minimal (no SMS/MMS charges), simplifies the subscription flow (no phone number handling, no Twilio webhooks), and still provides a rich experience with inline illustrations.

## Email provider: Postmark behind an abstraction

Postmark is the initial email provider, accessed through an interface so it can be swapped. Chosen for its transactional email focus, simple API, and good deliverability.

## Dev providers: No API keys required for development

In development, when `POSTMARK_API_TOKEN` is not configured, a dev email provider is used that logs emails to the console and stores them in SQLite. A dev-only web route (`/dev/messages`) lets developers view all sent emails in the browser. This means a developer can run the full application locally with just `BASE_URL` set — no Postmark account, no OpenAI key needed.

## Double opt-in: Confirm via email link

Subscribers confirm by clicking a confirmation link in their email. This is the standard double opt-in pattern for email services.

## Re-subscribe: Website only

After unsubscribing, users can only re-subscribe by visiting the website and entering their email again. This prevents accidental re-subscribes and ensures a deliberate opt-in via the full double opt-in flow.

## Database: SQLite

Eliminates database hosting costs entirely. The file lives on the VPS alongside the application. Sufficient for the expected scale of this project.

## Hosting: VPS with Kamal deploys

A Raspberry Pi 5 on the local network with Docker-based deploys via Kamal. Chosen over serverless because it's simpler with SQLite and costs are fixed rather than usage-based. Kamal was chosen over a raw SSH/git-pull deploy because it provides zero-downtime deploys, built-in rollback, and health checks — without the overhead of a full self-hosted PaaS like Coolify. TLS is handled by Cloudflare Tunnel, not by the container or Kamal proxy.

## Rate limiting on signup

IP-based rate limiting (5 signups per IP per hour) on the subscribe endpoint. Combined with the double opt-in requirement, this prevents abuse without requiring CAPTCHA complexity.

## Web design: Life is Strange: Double Exposure themed

The signup page and fact pages have a themed design inspired by the aesthetic of *Life is Strange: Double Exposure* — warm, indie, handcrafted feel with platypus personality.

## Platypus Fan cap: Configurable, default 1,000

Active Platypus Fans are capped at a configurable limit (`MAX_SUBSCRIBERS` env var, default 1,000) to control costs. The cap is enforced both at signup and at confirmation time. The home page displays the current active count and the limit so visitors can see availability. Only `active` Platypus Fans count toward the cap — when someone unsubscribes, a slot opens up.

## CLI: Manual daily send with dev-only force

The daily send can be triggered manually via `bun run daily-send`. A `--force` flag bypasses the idempotency check for repeated testing during development. The flag is rejected in production to prevent accidental double sends.

## Fact illustrations: AI-generated at sync time

Each fact gets one AI-generated illustration in a consistent minimalist line-drawing style (platypus character, hand-drawn aesthetic, rosy pink accents). Images are generated during the fact sync process — not on-demand or on a schedule — so each fact is illustrated exactly once. This keeps generation costs proportional to the fact library (not the subscriber count) and ensures images are ready before any fact is sent. If generation fails for a fact, the system gracefully degrades to text-only (no image on the web page or in the email).

## Daily emails: Inline illustration

Daily fact emails include the platypus illustration as an inline image when available. If no image exists for the fact, the email renders without it — the layout looks complete either way.

## Image storage: Local filesystem

Images are stored in `public/images/facts/` and served as static assets. No CDN or object storage. This matches the project's philosophy of simplicity and low operational cost. If the project scales beyond what a single VPS can serve, images could be moved to a CDN later.

## Daily send time: Fixed UTC

All Platypus Fans receive their fact at the same configured UTC time. No per-fan timezone handling. Keeps the cron job and data model simple.

## Terminology: "Platypus Fans"

Users who subscribe to the service are referred to as "Platypus Fans" in all user-facing text (web pages, emails). Internal/technical identifiers (database table `subscribers`, env var `MAX_SUBSCRIBERS`, status values) retain standard naming.
