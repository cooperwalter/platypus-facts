# Implementation Plan -- Daily Platypus Facts

## Status Summary

**All priorities through P67 implemented.** All application logic and infrastructure configuration complete. Only one placeholder remains (Pi 5 server IP in `config/deploy.yml`), which requires the physical network setup.

- **434 tests passing** across 23 test files with **1015 expect() calls**
- **Type check clean**, **lint clean**
- **28 real platypus facts** sourced and seeded with AI-generated illustrations (31 images in `public/images/facts/`)
- **Latest tag**: 0.0.42

---

## Outstanding Items

### Pi 5 Server IP — Deferred (requires physical setup)

`config/deploy.yml` line 9 still has `<your-server-ip>` placeholder. This requires the Raspberry Pi 5 to be set up on the local network and its IP confirmed. All other deploy config values are filled in.

---

## Remaining

- Confirm Pi 5 server IP and update `config/deploy.yml`
- Manual testing with Twilio and Postmark before production launch
- Database backup strategy (post-launch, not spec-required)

---

## Completed Priorities (1-67)

All 67 priorities shipped. See git history for details.

### Recent Completions

| Priority | Description | Notes |
|----------|-------------|-------|
| P62 | Create ARCHITECTURE.md | ASCII diagram with system components, data flow, deployment overview. |
| P63 | GitHub Actions ARM64 build | Added QEMU setup + `platforms: linux/arm64` to build-push-action. |
| P64 | Disable SSL in Kamal proxy | Changed `ssl: true` to `ssl: false` — Cloudflare handles TLS. |
| P65 | Fill deploy.yml placeholders | Image → `ghcr.io/cooperwalter/platypus-facts`, host → `platypus-facts.cooperwalter.dev`. Server IP deferred. |
| P66 | Platypus emoji in README | Added 🦫🦆🥚 to README heading per spec. |
| P67 | Fix .env.example PORT | Changed PORT from 3090 to 3000 to match production deploy config. |
| P61 | Background pattern spacing | Expanded SVG viewBox, increased CSS background-size, fixed aria conflict. |
| P58 | `dev_messages` SQLite table | Dev providers persist to SQLite for cross-process visibility. |

---

## Resolved Items

### P53 — EmailProvider `imageUrl` parameter — CLOSED (intentional deviation)

Image URL passed via HTML template data structure instead of interface parameter. Functionally equivalent.

### P54 — Twilio opt-out webhook — CLOSED

Twilio forwards STOP messages to the existing incoming message webhook.

### sent_facts ON DELETE RESTRICT — NOT A GAP

SQLite's default NO ACTION behaves identically to RESTRICT. Correct behavior for historical send records.

### Dockerfile fact sync — NOT A GAP

`src/index.ts` calls `syncFacts()` on server startup, satisfying the spec requirement.

---

## Known Non-Gaps

- **Logging**: No spec covers structured logging. Using `console.log`/`console.error` for v1.
- **Backups**: Spec mentions options but doesn't require implementation. Deferred.
- **`.env.development` Loading**: Bun handles automatically.
- **`dev_messages` Table**: Created unconditionally. Harmless in production.
- **`design-decisions.md` Traefik Reference**: Spec inconsistency; `infrastructure.md` is authoritative. Codebase correctly uses Cloudflare Tunnel.
