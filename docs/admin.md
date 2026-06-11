# Admin guide

Documentation for **DUCA staff and competition organisers** who run events on the DUCA CTF platform.

This is the most detailed guide in the documentation set. If you are a player looking for how to submit flags or read writeups, see the [user guide](./users.md) instead.

**Production instance:** [https://ctf.duca.au](https://ctf.duca.au) · **Admin panel:** [https://ctf.duca.au/admin](https://ctf.duca.au/admin)

---

## Individual play only

**Teams are not a feature of this platform.** Every participant has their own account. Leaderboards, solves, and points are always tracked per user. There is no way to:

- Register or name a team
- Assign players to a team
- View a team leaderboard or team score

DUCA may run events where informal collaboration is allowed (see [General Rules](https://ctf.duca.au/rules)), but the software only supports **individual play**. When planning a trimester CTF, tell students to register individually — do not expect a team mode in the admin panel.

---

## DUCA context: trimester CTFs as competitions

DUCA typically runs **one or two CTF events per university trimester**. On this platform, each event is a **competition**:

| Real-world event | Platform concept |
|------------------|------------------|
| Trimester CTF #1 | One competition (e.g. "DUCA CTF — T1 2026") |
| Trimester CTF #2 | Another competition (separate schedule and challenges) |
| Practice week / warm-up | Optional hidden competition or early-unlock challenges |
| Post-event solutions | Writeups (published after the competition ends) |

A single competition holds many **challenges** (Web, Crypto, Forensics, etc.). Players browse the competition, open challenges, submit flags, and climb an **individual** leaderboard.

You can run multiple competitions at once (for example, an alumni event alongside a student event) by creating separate competitions with different schedules. Use the **Hidden** flag if you are preparing content before announcement.

---

## Terminology

| Term | Meaning |
|------|---------|
| **Competition** | A scheduled CTF event with name, description, start/end times, and challenges. This is what you create for each trimester CTF. |
| **Challenge** | A single task inside a competition (e.g. "SQL Injection 101"). Has points, description, category, and one or more flags. |
| **Category** | Challenge type label (Web, Crypto, Forensics, Reverse, Pwn, Misc, OSINT). Default categories are seeded; you can add more. |
| **Flag** | Secret string players submit (e.g. `DUCA{...}`). Stored hashed; challenges can have multiple flags (stages). |
| **Submission** | One flag submit attempt (correct or incorrect). Logged in telemetry; not a separate database table. |
| **Solve** | A recorded correct submission. First correct flag on a challenge awards full points; extra flags on the same challenge award 0 points but still count as solves. |
| **First blood** | The first player to solve a challenge. Shown on leaderboards and the live solve feed. |
| **Unsolve / revert** | Admin action that removes a player's solve for a challenge (e.g. rule violation). Logged as `FLAG_SUBMIT_REVERTED`. |
| **Writeup** | Post-competition solution write-up for a challenge. Hidden from players until the competition ends. |
| **Site page** | Static content (Rules, Terms, Privacy, or custom pages you create). |
| **Support ticket** | A player's help request. Admins reply in **Support Chats**. |
| **Telemetry / activity log** | Audit trail: logins, views, submissions, admin actions, IP addresses. Retained 14 days by default. |
| **Hidden** | Competition or challenge not shown publicly. Use while drafting. |
| **Disabled** | User account blocked from logging in. |
| **DRAFT / ACTIVE / ENDED** | Competition status values. New competitions default to **DRAFT**. Availability is mainly driven by **start/end times** and **ENDED** status — `DRAFT` and `ACTIVE` behave the same for players. Click **End** to stop submissions early. |

### Timezone

All schedule fields in the admin panel use **Australia/Sydney (AEST/AEDT)**. Double-check start and end times when planning trimester events around daylight saving changes.

---

## Getting admin access

Admins use the **same login flow as players** (email OTP). There is no separate admin password.

### First admin on a new deployment

1. Deploy or start the platform.
2. Register by logging in at [https://ctf.duca.au/login](https://ctf.duca.au/login) with your email.
3. Promote yourself from the server:

   **Local development:**
   ```bash
   npm run make-admin -- your.email@deakin.edu.au
   ```

   **Production (Docker):**
   ```bash
   sudo docker compose -f docker-compose.prod.yml exec hirusha-duca-ctf-web \
     node scripts/make-admin.js your.email@deakin.edu.au
   ```

4. Refresh the site — an **Admin** link appears in the navigation.

### Promoting other organisers

**Admin → Users** → find the user → **Promote** to grant admin access.

**Demote** returns them to a normal player. **Disable** blocks login entirely (use for rule violations).

> All admins have **full access** to every admin feature. There are no partial roles (e.g. "challenge editor only").

---

## Admin panel

Open **Admin** at [https://ctf.duca.au/admin](https://ctf.duca.au/admin) from the navigation bar. Non-admins are redirected to the home page.

| Section | URL | Purpose |
|---------|-----|---------|
| Dashboard | [ctf.duca.au/admin](https://ctf.duca.au/admin) | Counts: users, competitions, challenges, activity in last 24 h |
| Users | [ctf.duca.au/admin/users](https://ctf.duca.au/admin/users) | List, promote/demote, disable accounts |
| User detail | `ctf.duca.au/admin/user/[email]` | Per-user solves, stats, full activity log |
| Competitions | [ctf.duca.au/admin/competitions](https://ctf.duca.au/admin/competitions) | Create and schedule events |
| Challenges | [ctf.duca.au/admin/challenges](https://ctf.duca.au/admin/challenges) | Create tasks, flags, points, categories |
| Submissions | [ctf.duca.au/admin/submissions](https://ctf.duca.au/admin/submissions) | Flag attempt history, unsolve |
| Support Chats | [ctf.duca.au/admin/chats](https://ctf.duca.au/admin/chats) | All player support tickets |
| Writeups | [ctf.duca.au/admin/writeups](https://ctf.duca.au/admin/writeups) | Post-event solution content |
| Pages | [ctf.duca.au/admin/pages](https://ctf.duca.au/admin/pages) | Rules, terms, privacy, custom pages |
| Telemetry | [ctf.duca.au/admin/telemetry](https://ctf.duca.au/admin/telemetry) | Full activity log with filters |

---

## Running a trimester CTF

End-to-end playbook for DUCA staff.

### Phase 1 — Before the event (1–2 weeks out)

1. **Confirm production is healthy**
   - Web container running, SMTP sends login codes, backups scheduled.
   - See [developer guide — production](./developers.md#production-deployment) and the root [README checklist](../README.md#production-checklist).

2. **Edit site content if needed**
   - **Admin → Pages** — update Rules, Terms, or Privacy for this trimester.
   - Add a custom page (e.g. `https://ctf.duca.au/pages/t1-2026-info`) with event-specific info; link it from your announcement.

3. **Create the competition**
   - **Admin → Competitions →** create.
   - Set **name** (e.g. `DUCA CTF — Trimester 1 2026`).
   - Set **start** and **end** in AEST/AEDT.
   - Write a **description** (format, prizes, Discord link, collaboration policy).
   - Leave **Hidden** checked while building challenges.

4. **Create challenges**
   - **Admin → Challenges →** create for each task.
   - Assign **competition**, **category**, **points**, **description**.
   - Add at least one **flag** per challenge (`value` + optional `label` for multi-stage).
   - Optional: **submission limit** per user, **custom start time** to stagger releases, **hidden** until release.
   - Test each challenge yourself: log in as a non-admin test account, submit flags, confirm scoring.

5. **Add categories** if needed (inline "Add category" on the challenge form).

6. **Announce registration**
   - Tell students to register **individually** at [https://ctf.duca.au](https://ctf.duca.au).
   - Remind them: **no team accounts** — one email per person.

### Phase 2 — Go live

1. **Unhide the competition** — toggle **Hidden** off in **Admin → Competitions**.
2. Verify the competition appears on [https://ctf.duca.au/competitions](https://ctf.duca.au/competitions) and challenges unlock at the correct times.
3. Monitor **Live Solves** at [https://ctf.duca.au/solves](https://ctf.duca.au/solves) and the **Leaderboard** at [https://ctf.duca.au/leaderboard](https://ctf.duca.au/leaderboard) during the event.
4. Staff should watch **Support Chats** for broken challenges or player questions.

### Phase 3 — During the event

| Task | Where |
|------|-------|
| Reply to player questions | **Admin → Support Chats** |
| Check for cheating / shared accounts | **Admin → Telemetry**, **Submissions**, user detail pages |
| Remove invalid solves | **Admin → Submissions** → Unsolve |
| Disable abusive accounts | **Admin → Users** → Disable |
| End early if needed | **Admin → Competitions** → **End** |

**Support tips:**
- Replies from admins without a display name show as **DUCA Support**.
- Link tickets to a competition/challenge when investigating technical issues.
- Close tickets when resolved; players cannot message closed tickets.

### Phase 4 — After the event

1. **End the competition** if it has not auto-ended by schedule (**End** button sets status to `ENDED`).
2. **Write writeups**
   - **Admin → Writeups** → select competition and challenge.
   - Content auto-saves. Use images via paste/drop (uploaded to the server).
   - Players see writeups at [https://ctf.duca.au/writeups](https://ctf.duca.au/writeups) once the competition has ended.
3. **Review submissions** for anomalies before publishing final standings.
4. **Optional:** export or screenshot leaderboard for records (no built-in export — use admin views or database backup).

### Phase 5 — Between events

- Leave ended competitions visible for history, or hide them.
- Old activity logs purge automatically after **14 days** (`ACTIVITY_LOG_RETENTION_DAYS`).
- Database backups run daily at 03:00 in production.

---

## Admin sections in detail

### Competitions

**Create / edit fields:**

| Field | Notes |
|-------|-------|
| Name | Shown publicly |
| Description | Rich text; event info, links, rules summary |
| Start / End | AEST/AEDT; controls when submissions are accepted |
| Hidden | When on, competition is not listed publicly |

**Actions:**

- **Edit** — change schedule or description (avoid changing flags mid-event without announcement).
- **End** — immediately stops the competition (`ENDED`). Submissions close.
- **Hidden toggle** — quick show/hide without opening the editor.
- **Delete** — removes competition **and all its challenges**. Use with care.

New competitions are created with status **DRAFT**. Players can compete when: not hidden, not ended, and current time is within start/end.

### Challenges

**Create / edit fields:**

| Field | Notes |
|-------|-------|
| Title | Challenge name |
| Competition | Parent event |
| Category | Web, Crypto, etc. |
| Points | Static value awarded on first correct flag |
| Description | Instructions, links, attachments (rich text) |
| Flags | One or more; value + optional label (e.g. "Stage 1") |
| Submission limit | Optional max attempts per user (includes wrong guesses) |
| Start time | Optional; challenge locked until this time (within competition window) |
| Hidden | Hide until you are ready to release |

**Table columns:** solve count, flag count, points — useful for balancing difficulty.

**Deleting a challenge** removes all associated solves and writeups.

### Users

**List view:** name, email, student ID, role, solve count, join date.

| Action | Effect |
|--------|--------|
| **Promote** | Grants full admin access |
| **Demote** | Removes admin access |
| **Disable** | Blocks login; destroys session on next request |

**User detail** (`https://ctf.duca.au/admin/user/[email]`): solve history (challenge, competition, points, IP, time) and paginated activity log. Use for investigating suspected multi-accounting or shared flags.

### Submissions

Shows the last **300** flag-related log entries: correct, incorrect, and reverted.

**Filters:** category, competition, result type.

**Unsolve:**
- From a row — quick unsolve for a correct submission.
- From the form — select user, load their solves, pick challenge to revert.

Unsolve removes all solve records for that user+challenge and logs the action. Use after confirmed rule violations or scoring mistakes.

### Support Chats

Inbox of **all** player tickets. Search by subject, name, or email. Filter OPEN / CLOSED.

Deep link: `https://ctf.duca.au/admin/chats?ticket=<id>`.

Real-time updates via server-sent events (SSE). All admins see the same inbox.

### Writeups

Select competition → challenge → author content.

- Visible to players only after competition **ends**.
- Admins can preview while the event is running.
- Images upload via the editor (max 5 MB; jpeg, png, gif, webp).

### Site pages

| Type | Slugs | Deletable? |
|------|-------|------------|
| System | `rules`, `terms`, `privacy` | No — content editable only |
| Custom | Your choice | Yes |

Custom pages can be **hidden** from public navigation. Public URL: `https://ctf.duca.au/pages/[slug]` (system pages also at [rules](https://ctf.duca.au/rules), [terms](https://ctf.duca.au/terms), [privacy](https://ctf.duca.au/privacy)).

Update rules before each trimester if collaboration or eligibility policies change. Remember to state that play is **individual** even if informal pairing is allowed.

### Telemetry

Browse the last **200** activity log entries. Filter by action type, IP, or user.

**Logged actions include:**

| Action | When |
|--------|------|
| `REGISTER` | New account |
| `LOGIN_CODE_SENT` / `LOGIN_SUCCESS` / `LOGIN_FAILED` | Authentication |
| `PROFILE_COMPLETED` | Onboarding finished |
| `CHALLENGE_VIEW` | Challenge page opened |
| `FLAG_SUBMIT_CORRECT` / `FLAG_SUBMIT_INCORRECT` | Flag submissions |
| `FLAG_SUBMIT_REVERTED` | Admin unsolve |
| `WRITEUP_VIEW` | Writeup read |
| `ADMIN_ACTION` | Any admin create/update/delete |
| `PAGE_VIEW` | Site page viewed |
| `LOGOUT` | Session ended |

Logs older than the retention window are deleted automatically (default **14 days**). Submissions view shows flag attempts only; telemetry shows everything.

---

## Scoring reference

- **Static points** — each challenge has a fixed value.
- **First correct flag** on a challenge → full points.
- **Additional flags** on the same challenge → 0 points (still recorded as solves).
- **Leaderboard** — sum of `pointsAwarded > 0` per user per competition.
- **Tie-break** — earlier last solve wins.
- **No team aggregation** — there is no team score to configure.

---

## Operational tasks

### Promote admin (CLI)

```bash
npm run make-admin -- user@example.com
```

### Manual activity log purge

```bash
npm run db:purge-activity
```

Also runs on web container start and daily at 03:15 (production backup container).

### Database backup / restore

```bash
npm run db:backup
npm run db:restore
```

See root [README — backup and restore](../README.md#database-backup-and-restore).

### Prisma Studio (direct DB access)

```bash
npm run db:studio
```

Use with care in production — prefer admin UI for day-to-day tasks.

### Environment variables (organiser-relevant)

| Variable | Default | Purpose |
|----------|---------|---------|
| `ACTIVITY_LOG_RETENTION_DAYS` | `14` | How long telemetry is kept |
| `SMTP_*` | — | Login codes (required) |
| `SESSION_SECRET` | — | Session security |
| `UPLOAD_DIR` | `public/uploads` | Writeup/page images |
| `BACKUP_KEEP_COUNT` | `3` | Rotating DB backups |

---

## Troubleshooting for organisers

| Problem | What to check |
|---------|----------------|
| Player cannot log in | SMTP working; check spam; account not **Disabled** |
| Challenge locked | Competition times, challenge `startAt`, **Hidden** flags, competition **Ended** |
| Flag "incorrect" but should work | Exact format (case, braces); flag added correctly in admin; player not rate-limited |
| Leaderboard wrong | Unsolve and resubmit scenario; static points — no dynamic decay |
| Writeup not visible | Competition must be **ended**; writeup content saved |
| Support messages not appearing | Ticket status OPEN; SSE requires stable connection |
| Telemetry shows Docker IP | Caddy must forward `X-Forwarded-For` / `X-Real-IP` — see [README](../README.md#client-ip-logging-telemetry--solves) |

---

## Security and fair play

- Flags are **bcrypt-hashed** in the database.
- Rate limits: 10 flag submits/minute, 3 OTP sends/15 min per email.
- Organisers can **disable** accounts and **unsolve** challenges.
- All admin mutations log `ADMIN_ACTION` with metadata.
- Remind players: **one account per person**; the platform does not support teams, so shared accounts are the main fairness risk.

---

## Related documentation

- [User guide](./users.md) — what players see
- [Developer guide](./developers.md) — deployment and technical setup
- [Architecture](./architechture.md) — scoring, auth, SSE internals
- [Documentation index](./README.md)
