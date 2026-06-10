# User guide

How to use the DUCA CTF platform as a player.

## Individual play only

This platform is for **individual participation only**. You sign up with your own email, solve challenges under your own account, and earn points on your own leaderboard entry.

**There are no teams.** You cannot create a team, join a team, or share a team score on this platform. One person, one account. If organisers allow informal collaboration on a challenge, that is a competition rule — the platform still records every solve under the account that submitted the flag.

---

## Account and login

### Creating an account

1. Go to **Login** (`/login`).
2. Enter your email address and request a login code.
3. Check your inbox for a **6-digit code** (valid for 10 minutes).
4. Enter the code to sign in.

On your first login, the platform creates your account automatically. No password is required.

### Onboarding

After your first successful login, you are asked to complete your profile:

- **Display name** (required) — shown on leaderboards and solve feeds
- **Student ID** (optional)

You can use the platform before finishing onboarding, but completing your profile is recommended so organisers can identify you on scoreboards.

### Logging out

Use **Logout** from the navigation menu. Your session lasts up to 7 days unless you log out or your account is disabled.

### Rules

By playing, you agree to the platform [General Rules](/rules) and [Terms of Service](/terms). Key points:

- One person, one account
- Do not share flags or solutions unless organisers explicitly allow it
- Do not attack the platform or other users
- Do not publish writeups or flags before the competition ends

---

## Competitions

A **competition** is a scheduled CTF event — for example, a DUCA trimester CTF. Each competition has:

- A name and description
- A start and end time (AEST/AEDT)
- A set of challenges grouped by category

Browse competitions at **Competitions** (`/competitions`). Open a competition to see its challenges, schedule, and status.

### Competition states

| State | What you see |
|-------|----------------|
| **Upcoming** | Competition listed; challenges may show countdown timers before they unlock |
| **Active** | You can open challenges and submit flags (login required) |
| **Ended** | Submissions are closed; writeups may become available |

---

## Playing challenges

### Opening a challenge

Challenge pages (`/challenges/[id]`) require you to be **logged in**. Guests can browse competition listings but cannot open individual challenges or submit flags.

On a challenge page you will see:

- Title, category, and point value
- Description (instructions, download links, hints from organisers)
- A flag submission box
- Solve list (who has solved it)
- Your submission stats (failed attempts, optional attempt limit, multi-flag progress)

### Submitting flags

1. Find the flag while working on the challenge (format is usually `DUCA{...}` unless stated otherwise).
2. Enter the flag in the submission box and submit.
3. A correct flag awards points; an incorrect flag is logged but does not award points.

**Rate limits:** You can submit at most **10 flags per minute**. Some challenges also have a total attempt limit set by organisers.

### Multi-flag challenges

Some challenges have more than one flag (for example, staged challenges). The **first correct flag** on a challenge awards the full point value. Additional flags on the same challenge still count as solves but award **0 extra points**.

### When you cannot submit

Submissions are blocked when:

- The competition has ended
- The challenge is hidden or not yet unlocked (before its start time)
- You have reached the challenge's submission limit
- You are not logged in

---

## Leaderboards and live solves

### Leaderboard

**Leaderboard** (`/leaderboard`) shows rankings per competition:

- Total points per player (individual scores only — no teams)
- Tie-break: earlier last solve wins
- Per-challenge solve order (first blood)

Rankings use your display name when set, otherwise your email.

### Live solves

**Live Solves** (`/solves`) is a real-time feed of correct submissions across competitions. Filter by competition to follow an event as it happens.

---

## Writeups

After a competition **ends**, organisers may publish **writeups** — worked solutions for each challenge.

- Browse writeups at **Writeups** (`/writeups`) (login required)
- Writeups are locked while a competition is still running
- If no writeup has been published for a challenge yet, the page says so

Writeups are for learning after the event. Do not share them publicly before organisers intend them to be released.

---

## Support

If you need help during an event — a broken challenge, a scoring question, or a platform issue — use **Support** (`/support`).

1. Create a ticket with a subject and message.
2. Optionally link the ticket to a competition or challenge.
3. Attach screenshots or files if helpful (images, PDF, zip, plain text; max 10 MB).
4. Chat with DUCA organisers in the ticket thread.

You can only see your own tickets. Organisers reply as **DUCA Support**. Tickets can be open or closed; you cannot send new messages on a closed ticket.

---

## What you can access

| Area | Guest (not logged in) | Logged-in player |
|------|----------------------|------------------|
| Home, competitions list | Yes | Yes |
| Leaderboard, live solves | Yes | Yes |
| Rules, terms, privacy | Yes | Yes |
| Challenge pages & flag submit | No | Yes (when available) |
| Writeups | No | Yes (after competition ends) |
| Support tickets | No | Yes (your tickets only) |
| Admin panel | No | No |

---

## Privacy

The platform logs activity for security and operations (logins, page views, submissions, IP address). See the [Privacy Policy](/privacy) for details. Activity logs are retained for a limited period (default 14 days).

---

## Getting help

- **Platform / challenge issues during an event:** [Support](/support)
- **DUCA association:** [duca.au](https://duca.au)
- **Rule clarifications:** organisers via official event channels or support tickets
