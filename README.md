# DUCA CTF

Capture-the-flag platform for the [Deakin University Cybersecurity Association](https://duca.au/) (DUCA).

![](./docs/images/home_image.png)

## Features

- Passwordless email OTP authentication
- Competitions with scheduled challenges and countdown timers
- Multi-flag challenges with static scoring
- Live solves feed (SSE) and leaderboards
- Support chat with admin inbox
- Post-competition writeups (markdown or rich text)
- Admin panel for users, competitions, challenges, writeups, telemetry, and site pages
- All times displayed in AEST/AEDT (Australia/Sydney)

## Stack

| Layer | Technology |
|-------|------------|
| App | Next.js 15 (App Router, JavaScript) |
| Database | PostgreSQL 16 + Prisma 7 |
| Cache / pub-sub | Redis 7 |
| UI | Tailwind CSS + shadcn/ui (dark theme) |
| Production proxy | Caddy (external, via `intranet_1` Docker network) |

---

## Development guide

### Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL and Redis)
- SMTP credentials for sending login codes

### 1. Clone and install

```bash
git clone <repo-url> duca-ctf
cd duca-ctf
npm install
```

### 2. Start backing services

```bash
sudo docker compose up -d
```

This starts:

| Service | Host port | Purpose |
|---------|-----------|---------|
| `duca-ctf-postgres` | 5432 | PostgreSQL (`duca_ctf` database) |
| `duca-ctf-redis` | 6379 | Rate limits + SSE pub/sub |

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
DATABASE_URL=postgresql://duca:duca@localhost:5432/duca_ctf
REDIS_URL=redis://localhost:6379
SESSION_SECRET=<random-32+-char-string>
SMTP_HOST=...
SMTP_PORT=465
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM_EMAIL=...
```

`DATABASE_URL` is read from `prisma.config.mjs`, not `schema.prisma`.

Without `REDIS_URL`, the app falls back to in-memory stores (fine for single-process local dev).

### 4. Migrate and seed

```bash
npm run db:migrate
npm run db:seed
```

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Promote an admin

After a user registers and logs in:

```bash
npm run make-admin -- user@example.com
```

### Dev scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start production build locally |
| `sudo docker compose up -d` | Start Postgres + Redis |
| `sudo docker compose down` | Stop Postgres + Redis |
| `npm run db:migrate` | Run Prisma migrations (dev) |
| `npm run db:migrate:deploy` | Apply migrations (production) |
| `npm run db:seed` | Seed default categories and site pages |
| `npm run db:studio` | Open Prisma Studio |
| `npm run make-admin` | Promote a user to admin by email |

### Dev troubleshooting

**Port 5432 already in use**

```bash
sudo systemctl stop postgresql   # if a system Postgres is running
```

**Docker permission denied**

Either use `sudo` with Docker commands (as shown in this guide), or add your user to the `docker` group:

```bash
sudo usermod -aG docker $USER
# log out and back in, then docker works without sudo:
docker compose up -d
```

---

## Deployment guide

Production runs as three Docker containers behind Caddy. PostgreSQL and Redis communicate with the web app on a private bridge network (`hirusha-duca-ctf-net`). Only the web container also joins the external `intranet_1` network so Caddy can reverse-proxy to it.

```
                    ┌─────────────┐
  Internet ────────►│    Caddy    │  (intranet_1)
                    └──────┬──────┘
                           │ :3000
                    ┌──────▼──────────────────┐
                    │  hirusha-duca-ctf-web   │
                    └──┬──────────────────┬───┘
           hirusha-duca-ctf-net           │
              ┌──────────┴──────────┐     │
              │                     │     │
     ┌────────▼────────┐   ┌───────▼─────────┐
     │ hirusha-duca-ctf │   │ hirusha-duca-ctf│
     │    -postgres     │   │     -redis      │
     └──────────────────┘   └─────────────────┘
```

### Prerequisites

- Docker and Docker Compose v2 on the host
- External Docker network `intranet_1` (shared with Caddy)
- SMTP credentials
- DNS + TLS handled by Caddy

Create the shared network once if it does not exist:

```bash
sudo docker network create intranet_1
```

### 1. Configure production environment

On the server, clone the repo and create `.env` from the production template:

```bash
cp .env.prod.example .env
```

Edit `.env` — at minimum set:

| Variable | Notes |
|----------|-------|
| `POSTGRES_PASSWORD` | Strong password; used by Postgres and `DATABASE_URL` |
| `SESSION_SECRET` | Random string, at least 32 characters |
| `SMTP_*` | Required for login codes |

`docker-compose.prod.yml` sets `DATABASE_URL`, `REDIS_URL`, `NODE_ENV`, and `UPLOAD_DIR` automatically.

### 2. Build and start

```bash
sudo docker compose -f docker-compose.prod.yml up -d --build
```

On startup the web container runs `prisma migrate deploy` then starts Next.js.

### 3. Seed (first deploy only)

```bash
sudo docker compose -f docker-compose.prod.yml exec hirusha-duca-ctf-web \
  node prisma/seed.js
```

### 4. Promote an admin

```bash
sudo docker compose -f docker-compose.prod.yml exec hirusha-duca-ctf-web \
  node scripts/make-admin.js user@example.com
```

### 5. Configure Caddy

Caddy must be attached to `intranet_1` so it can reach the web container by service name:

```caddyfile
ctf.example.com {
    reverse_proxy hirusha-duca-ctf-web:3000
}
```

Example Caddy Docker Compose snippet:

```yaml
services:
  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - intranet_1

networks:
  intranet_1:
    external: true
```

The web container is **not** published to the host — Caddy is the only public entry point.

### Production services

| Container | Network(s) | Notes |
|-----------|------------|-------|
| `hirusha-duca-ctf-web` | `hirusha-duca-ctf-net`, `intranet_1` | Next.js, port 3000 (expose only) |
| `hirusha-duca-ctf-postgres` | `hirusha-duca-ctf-net` | No host port binding |
| `hirusha-duca-ctf-redis` | `hirusha-duca-ctf-net` | No host port binding |

### Volumes

| Volume | Purpose |
|--------|---------|
| `hirusha-duca-ctf-pgdata` | PostgreSQL data |
| `hirusha-duca-ctf-redisdata` | Redis AOF persistence |
| `hirusha-duca-ctf-uploads` | User/support/writeup uploads (`/app/data/uploads`) |

### Updates

```bash
git pull
sudo docker compose -f docker-compose.prod.yml up -d --build
```

Migrations run automatically on container start.

### Production operations

**View logs**

```bash
sudo docker compose -f docker-compose.prod.yml logs -f hirusha-duca-ctf-web
```

**Restart a service**

```bash
sudo docker compose -f docker-compose.prod.yml restart hirusha-duca-ctf-web
```

**Backup Postgres**

```bash
sudo docker compose -f docker-compose.prod.yml exec hirusha-duca-ctf-postgres \
  pg_dump -U duca duca_ctf > backup.sql
```

**Shell into web container**

```bash
sudo docker compose -f docker-compose.prod.yml exec hirusha-duca-ctf-web sh
```

### Production checklist

- [ ] `POSTGRES_PASSWORD` and `SESSION_SECRET` set to strong random values
- [ ] SMTP credentials verified (send a test login code)
- [ ] `intranet_1` network exists and Caddy is attached
- [ ] Caddy `reverse_proxy` points to `hirusha-duca-ctf-web:3000`
- [ ] Database seeded on first deploy
- [ ] At least one admin user promoted
- [ ] Upload volume backed up with the rest of the stack
