# DUCA CTF

Custom capture-the-flag platform for the Deakin University Cybersecurity Association (DUCA).

## Features

- Passwordless email OTP authentication
- Competitions with scheduled challenges and countdown timers
- Multi-flag challenges with static scoring
- Live solves feed and leaderboards
- Post-competition writeups (markdown or rich text, with images)
- Admin panel for users, competitions, challenges, writeups, and telemetry
- All times displayed in AEST/AEDT (Australia/Sydney)

## Prerequisites

- Node.js 18+
- A running PostgreSQL instance (this project uses the existing Docker Postgres on `localhost:5432`)
- SMTP credentials for sending login codes

## Development Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your `SESSION_SECRET` and SMTP credentials.

3. Ensure PostgreSQL is available

This project uses your **existing Docker Postgres** on port `5432` (container `blume3-db`). It expects:

- Database: `duca_ctf`
- User: `duca` / password: `duca`

If those don't exist yet, create them inside the running container:

```bash
sudo docker exec blume3-db psql -U blume -d blume3 -c "CREATE ROLE duca WITH LOGIN PASSWORD 'duca';"
sudo docker exec blume3-db psql -U blume -d blume3 -c "CREATE DATABASE duca_ctf OWNER duca;"
```

Alternatively, set `DATABASE_URL` in `.env` and `.env.local` to match your Postgres credentials.

4. Run migrations and seed default categories:

```bash
npm run db:migrate
npm run db:seed
```

5. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Admin Access

After a user registers and logs in, promote them to admin:

```bash
npm run make-admin -- user@example.com
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run db:up` | No-op (uses existing Docker Postgres) |
| `npm run db:down` | No-op (shared container not stopped) |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed default challenge categories |
| `npm run db:studio` | Open Prisma Studio |
| `npm run make-admin` | Promote a user to admin by email |

## Architecture

- **App**: Next.js 15 (JavaScript, App Router) — runs on the host via `npm run dev`
- **Database**: Shared Docker PostgreSQL on `localhost:5432` (`duca_ctf` database)
- **UI**: Tailwind CSS + shadcn/ui (dark theme)

## Troubleshooting

### `permission denied` on `/var/run/docker.sock`

Your user is not in the `docker` group. Docker is running, but only `root` and members of `docker` can use it.

**Permanent fix (recommended):**

```bash
sudo usermod -aG docker $USER
```

Log out and back in (or reboot), then verify:

```bash
groups          # should include "docker"
npm run db:up
```

To apply the group in the current shell without logging out:

```bash
newgrp docker
npm run db:up
```

**One-off workaround:**

```bash
sudo docker compose up -d
```

You will need `sudo` for `db:down` as well if you use this approach.

> **Note:** Port 5432 may already be in use by a system PostgreSQL install. The Docker container expects to bind that port. Stop the system service first if needed: `sudo systemctl stop postgresql`
