# Developer guide

Technical documentation for developers and operators working on the DUCA CTF platform.

For organiser workflows (creating competitions, running trimester CTFs), see the [admin guide](./admin.md). For player-facing behaviour, see the [user guide](./users.md).

## Individual play only

The data model tracks **users**, not teams. There is no `Team` table, team APIs, or team UI. Leaderboards and solves aggregate per `User`. Do not plan features assuming team registration or team scores without significant new development.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Application | Next.js 15 (App Router, JavaScript) |
| Database | PostgreSQL 16 + Prisma 7 (`@prisma/adapter-pg`) |
| Cache / pub-sub | Redis 7 (optional in dev) |
| Auth | iron-session + bcryptjs (passwordless OTP) |
| Email | nodemailer |
| UI | Tailwind CSS 4 + shadcn/ui (dark theme) |
| Editors | TipTap, react-md-editor |
| Error tracking | Sentry-compatible SDK → Bugsink |
| Production proxy | Caddy on external Docker network `intranet_1` |

See [architecture](./architechture.md) for auth flows, scoring, SSE buses, and security details.

---

## Project structure

```
src/
  app/              # Pages and API routes
    admin/          # Admin panel (role-gated layout)
    api/            # REST handlers (auth, challenges, admin, support, …)
    challenges/     # Challenge pages
    competitions/   # Competition listing and detail
    support/        # Player support tickets
    writeups/       # Post-competition writeups
  components/       # React UI (admin, support, layout, …)
  hooks/            # SSE, visibility helpers
  lib/              # Business logic
prisma/
  schema.prisma     # Data model
  migrations/       # SQL migrations
  seed.js           # Default categories + site pages
scripts/            # make-admin, backup, restore, purge-activity
docker-compose.yml        # Dev Postgres + Redis
docker-compose.prod.yml   # Production stack
Dockerfile                # Standalone Next.js image
```

### Key library modules

| Module | Role |
|--------|------|
| `src/lib/auth.js` | Session, OTP, `requireAuth` / `requireAdmin` |
| `src/lib/session.js` | iron-session configuration |
| `src/lib/db.js` | Prisma singleton (server) |
| `src/lib/competitions.js` | Availability helpers (`isCompetitionActive`, etc.) |
| `src/lib/challenges.js` | Challenge queries |
| `src/lib/flags.js` | Flag normalisation and bcrypt verify |
| `src/lib/scoring.js` | Leaderboards, user points |
| `src/lib/submissions.js` | Submit limits, attempt counting |
| `src/lib/telemetry.js` | Activity logging |
| `src/lib/support.js` | Tickets, messages, display names |
| `src/lib/solve-feed.js` | Live solve SSE |
| `src/lib/site-pages.js` | CMS-style pages with cache |

**Auth pattern:** No Next.js middleware. Pages call `requirePageAuth` / layout checks; API routes call `requireAuth` or `requireAdmin`.

---

## Local development

### Prerequisites

- Node.js 20+
- Docker (PostgreSQL and Redis)
- SMTP credentials for login codes

### Setup

```bash
git clone https://github.com/hirusha-adi/duca-ctf.git duca-ctf
cd duca-ctf
npm install

sudo docker compose up -d    # Postgres :5432, Redis :6379

cp .env.example .env.local   # edit secrets + SMTP

npm run db:migrate
npm run db:seed
npm run dev                  # http://localhost:3000
```

### Promote an admin

After logging in once:

```bash
npm run make-admin -- user@example.com
```

### Dev scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Run production build locally |
| `npm run db:migrate` | Prisma migrate dev |
| `npm run db:migrate:deploy` | Apply migrations (production) |
| `npm run db:seed` | Seed categories + system site pages |
| `npm run db:studio` | Prisma Studio |
| `npm run db:purge-activity` | Delete expired activity logs |
| `npm run make-admin` | Promote user to admin |
| `npm run db:backup` / `db:restore` | Production DB backup scripts |

### Environment variables (development)

From `.env.example`:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Optional; omit for in-memory rate limits (single process) |
| `SESSION_SECRET` | Cookie encryption (≥ 32 characters) |
| `SMTP_*` | Login code email delivery |
| `UPLOAD_DIR` | Upload storage (default `public/uploads`) |
| `BUGSINK_DSN` | Optional error tracking |
| `ACTIVITY_LOG_RETENTION_DAYS` | Activity log retention (default 14) |

`DATABASE_URL` is also read from `prisma.config.mjs`.

### Instrumentation

On Node.js server start, `src/instrumentation.js` loads Sentry config and purges expired activity logs via `src/instrumentation.node.js` (Node-only; avoids bundling `pg` for Edge).

---

## Database

### Schema overview

Core models (see `prisma/schema.prisma`):

- **User** — email, display name, student ID, role (`USER` | `ADMIN`), disabled flag
- **Competition** — schedule, status, hidden
- **Challenge** — points, category, flags, optional submit limit and start time
- **Flag** — bcrypt hash + plaintext value (admin reference)
- **Solve** — user + challenge + points awarded + IP
- **Writeup** — post-event content per challenge
- **ActivityLog** — telemetry entries
- **SupportTicket** / **SupportMessage** — support chat
- **SitePage** — rules, terms, privacy, custom pages

There is **no Team model**.

### Migrations

```bash
npm run db:migrate          # development
npm run db:migrate:deploy   # production / CI
```

### Seeding

`npm run db:seed` creates:

- Default challenge categories (Web, Crypto, Forensics, Reverse, Pwn, Misc, OSINT)
- System site pages (rules, terms, privacy) from `src/lib/default-site-pages.js`

Does **not** seed competitions, challenges, or users.

---

## Production deployment

Full operator steps are in the root [README](../README.md#deployment-guide). Summary:

### Stack

| Container | Role |
|-----------|------|
| `hirusha-duca-ctf-web` | Next.js (port 3000, internal) |
| `hirusha-duca-ctf-postgres` | Database |
| `hirusha-duca-ctf-redis` | Rate limits + SSE pub/sub |
| `hirusha-duca-ctf-backup` | Daily `pg_dump` at 03:00 |

Caddy on network `intranet_1` reverse-proxies to the web container.

### First deploy

```bash
mkdir -p data/postgres/pgdata data/redis data/uploads backups
cp .env.prod.example .env   # set POSTGRES_PASSWORD, SESSION_SECRET, SMTP_*, etc.

sudo docker network create intranet_1   # if needed
sudo docker compose -f docker-compose.prod.yml up -d --build

# First deploy only:
sudo docker compose -f docker-compose.prod.yml exec hirusha-duca-ctf-web node prisma/seed.js
sudo docker compose -f docker-compose.prod.yml exec hirusha-duca-ctf-web \
  node scripts/make-admin.js user@example.com
```

Startup (`docker-entrypoint.sh`): `prisma migrate deploy` → purge activity logs → `node server.js`.

### Client IP behind Caddy

Forward headers in Caddy so telemetry and solve logs show real client IPs:

```caddyfile
reverse_proxy hirusha-duca-ctf-web:3000 {
    header_up X-Forwarded-For {remote_ip}
    header_up X-Real-IP {remote_ip}
}
```

### Next.js config notes

`next.config.mjs` sets `serverExternalPackages` for `pg`, `pg-connection-string`, and `@prisma/adapter-pg` so database drivers are not incorrectly bundled.

---

## API surface (overview)

| Area | Prefix | Auth |
|------|--------|------|
| Auth | `/api/auth/*` | Public / session |
| Challenges | `/api/challenges/[id]/submit` | `requireAuth` |
| Admin | `/api/admin/*` | `requireAdmin` |
| Support | `/api/support/*` | `requireAuth` (scoped) |
| Upload | `/api/upload` | `requireAdmin` |
| SSE | `/api/solves/stream`, `/api/support/.../stream` | Varies |

Admin pages live under `/admin/*` with layout role check (`src/app/admin/layout.js`).

---

## Testing and quality

```bash
npm run lint
npm run build
```

Verify SMTP by sending a login code. Verify scoring with a test user account before trimester events.

---

## Related documentation

- [Documentation index](./README.md)
- [Admin guide](./admin.md)
- [User guide](./users.md)
- [Architecture](./architechture.md)
- [Root README](../README.md)
