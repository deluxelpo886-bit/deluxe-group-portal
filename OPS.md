# Deluxe Ops — Generator Operations Tracker

An internal, role-based web app for tracking generator jobs across **Deluxe
Heavy Equipment Rental** and **Deluxe Energy Solutions** (Abu Dhabi). It runs
inside the existing Deluxe Group Portal server — same Node/Express process, same
SQLite database, same JWT login — and is served at **`/ops`**.

- Original LPO/invoice portal: `/`
- Generator operations app: **`/ops`**

## Roles

Each person logs in with their own username/password. Access is gated by role:

| Role | Can do |
| --- | --- |
| **Admin** | Manage the generator fleet, manage technicians & roles, create any job, full job board, edit the daily service feed |
| **Ops Head** | View the full job board, assign/reassign technicians, edit the daily service feed |
| **Technician** | See **only their own** assigned jobs and advance them through their stages |

The portal's original admin account (`deluxelpoadmin`) is automatically an Ops
admin, so nobody gets locked out. Admins create everyone else from the
**Technicians** tab (choose a role: Technician / Ops Head / Admin).

## Data model

**Generators** — DG number, KVA rating, company (Deluxe HE / Deluxe Energy),
status (`available`, `on_rent`, `workshop`, `breakdown`, `outside`), current
client & location.

**Jobs** — four types, each with its own stage pipeline:

| Type | Pipeline |
| --- | --- |
| Scheduled service | Assigned → En Route → On Site → **Completed** |
| Breakdown (urgent) | Reported → Assigned → En Route → On Site → **Resolved** |
| Workshop repair | Intake → Diagnosis → Repair → Testing → **Ready** |
| Outside repair | Sent Out → With Vendor → **Returned** |

Reaching the final stage closes the job. Every stage change and assignment is
recorded in a per-job history log.

**Daily service feed** — Admin/Ops Head enter `DG number + days remaining` each
morning from Netsonic's *Machinery Service Due* report (**Service Due** tab).
Technicians then see those as countdown rings on the matching job.

## Technician "alarm-clock" view

- **Breakdowns** appear as a large ringing red alarm at the top of the screen.
- **Routine service** shows as a countdown ring per job:
  green (> 7 days) → gold (4–7) → red (≤ 3), and **red + pulsing** when due
  tomorrow or overdue.
- Each job card shows its pipeline and a one-tap button to advance to the next
  stage.

## Branding

Every generator and job is tagged by company colour: **navy `#152B54`** for
Deluxe Heavy Equipment, **gold `#E8A93A`** for Deluxe Energy.

## API (all under `/api/ops`, JWT required)

| Method & path | Role | Purpose |
| --- | --- | --- |
| `GET /me` | any | Current user, role, and UI metadata |
| `GET /generators` | any | List fleet |
| `POST/PUT/DELETE /generators[/:id]` | admin | Manage fleet |
| `GET /technicians` | admin, ops_head | Technician roster |
| `GET /users` | admin | Full ops roster with roles |
| `POST /technicians` | admin | Create an account (any role) |
| `PUT /users/:username/role` | admin | Change role / display name |
| `GET /jobs` | any | Board (technicians get only their own) |
| `GET /jobs/:id` | any\* | Job detail + history |
| `POST /jobs` | admin | Create a job |
| `PUT /jobs/:id/assign` | admin, ops_head | Assign/reassign technician |
| `PUT /jobs/:id/stage` | assignee / admin | Advance stage |
| `DELETE /jobs/:id` | admin | Delete a job |
| `GET /service-due` | any | Daily service feed |
| `POST /service-due` | admin, ops_head | Add/update a DG countdown |
| `DELETE /service-due/:dg` | admin, ops_head | Remove an entry |

\* A technician can only open jobs assigned to them.

## Storage & deployment

All ops data lives in the same SQLite file as the rest of the portal
(`ops_generators`, `ops_jobs`, `ops_job_events`, `ops_service_due` tables, plus
`role`/`display_name` columns on `users`). No new services, ports, or env vars
are needed — the existing Render deployment serves `/ops` automatically. Set a
stable `JWT_SECRET` in the environment so sessions survive restarts (see the
main README/BACKUPS/ALERTS docs).

### First run

1. Sign in at `/ops` as `deluxelpoadmin` (change the password after first login).
2. **Technicians** tab → add your Ops Head(s) and technicians.
3. **Generators** tab → add the fleet.
4. **Job Board** → *New Job*, assign a technician.
5. **Service Due** → enter the morning's DG + days-remaining figures.
