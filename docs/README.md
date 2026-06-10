# DUCA CTF documentation

Documentation for the [Deakin University Cybersecurity Association](https://duca.au/) (DUCA) capture-the-flag platform.

## Important: individual play only

This platform is built for **individual participants**. Each person registers with their own account, submits flags under that account, and appears on leaderboards as an individual.

**Teams are not a feature of this project.** There is no team registration, team scoring, team leaderboards, or shared team accounts. If you run a group activity, each student still needs their own login. Organisers may allow informal collaboration on challenges (see [General Rules](/rules)), but the platform always records solves per user.

---

## Who should read what?

| Audience | Document | Description |
|----------|----------|-------------|
| **DUCA staff & organisers** | [Admin guide](./admin.md) | Running trimester CTFs, competitions, challenges, users, support, telemetry, and production operations |
| **Players** | [User guide](./users.md) | Logging in, playing challenges, leaderboards, writeups, and support |
| **Developers & operators** | [Developer guide](./developers.md) | Local setup, architecture, deployment, database, and scripts |

---

## Quick links

### For organisers (start here)

1. [Terminology](./admin.md#terminology) — competitions, challenges, flags, solves, and more
2. [Running a trimester CTF](./admin.md#running-a-trimester-ctf) — end-to-end playbook for DUCA events
3. [Admin panel sections](./admin.md#admin-panel) — what each screen does
4. [Getting admin access](./admin.md#getting-admin-access)

### For players

1. [Creating an account & logging in](./users.md#account-and-login)
2. [Playing challenges](./users.md#playing-challenges)
3. [Leaderboards & live solves](./users.md#leaderboards-and-live-solves)
4. [Writeups](./users.md#writeups)

### For developers

1. [Local development setup](./developers.md#local-development)
2. [Project structure](./developers.md#project-structure)
3. [Production deployment](./developers.md#production-deployment)
4. [Architecture](./architechture.md) — system design deep-dive

---

## Other resources

| Resource | Location |
|----------|----------|
| Repository README | [../README.md](../README.md) — quick start, deployment checklist, operations |
| Architecture | [architechture.md](./architechture.md) — auth, scoring, SSE, security |
| Environment templates | [`.env.example`](../.env.example) (dev), [`.env.prod.example`](../.env.prod.example) (prod) |

---

## DUCA context

DUCA typically runs **one or two CTF events per university trimester**. On this platform, each of those events is set up as a **competition**: a scheduled container with its own challenges, leaderboard, writeups, and rules window.

All times in the admin panel and player UI use **Australia/Sydney (AEST/AEDT)**.
