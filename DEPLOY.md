# Deploying the Lab Attendance System (Render)

This deploys all three pieces to **Render** so anyone on the internet can reach the app:

| Service | What | Render type |
|---|---|---|
| `lab-attendance-db` | PostgreSQL database | Managed Postgres |
| `lab-attendance-api` | Express backend (`server/`) | Web Service |
| `lab-attendance-web` | Next.js frontend (`client/`) | Web Service |

The `render.yaml` Blueprint in this repo defines all three — Render reads it and creates everything in one step.

---

## Step 1 — Put the code on GitHub

Render deploys from a Git repo. From the project root (`lab-attendance-system/`):

```bash
git init
git add .
git commit -m "Initial commit for deployment"
```

Create an **empty** repo on github.com (no README), then:

```bash
git remote add origin https://github.com/<your-username>/lab-attendance-system.git
git branch -M main
git push -u origin main
```

> `.gitignore` already excludes `node_modules`, `.env` files, the `.zip`, and the `.docx` report, so secrets and large files stay out of the repo.

## Step 2 — Create the Blueprint on Render

1. Sign up at <https://render.com> (free; sign in with GitHub).
2. Dashboard → **New +** → **Blueprint**.
3. Select your `lab-attendance-system` repo. Render detects `render.yaml`.
4. It will ask for the one value marked `sync: false`:
   - **`NEXT_PUBLIC_API_URL`** (on the web) — enter `https://lab-attendance-api.onrender.com` (the predicted API URL). If Render assigns a different name, you'll correct it in Step 4.
5. Click **Apply**. Render creates the database and both services and starts building.

## Step 3 — Database sets itself up (automatic)

Nothing to do here. The API's build runs `npm run db:deploy`, which **on the first deploy only** creates all tables, applies migrations, and seeds demo users/courses/labs. On every later deploy it detects the existing schema and does nothing, so your data is never wiped. (No shell step required.)

> Want a clean slate? Drop the database (or delete & recreate the `lab-attendance-db` instance) and redeploy — the next build re-seeds the empty DB.

## Step 4 — (Optional) Restrict who can mark attendance

By default the app is **open to everyone, on any network** (`ALLOWED_CIDRS=0.0.0.0/0,::/0` in `render.yaml`) — anyone can log in and mark attendance. That's ideal for public testing.

To later lock marking down to your college Wi-Fi:

1. On the college network, visit <https://whatismyip.com> and copy the **public** IPv4.
2. Render → **lab-attendance-api** → **Environment** → change `ALLOWED_CIDRS`, e.g.:
   ```
   203.0.113.5/32
   ```
   Multiple networks are comma-separated: `203.0.113.5/32,198.51.100.0/24`
3. Save — the API redeploys automatically. Off-network users can still log in and view, but can't mark attendance.

## Step 5 — Point the frontend at the backend

1. Render → **lab-attendance-api** → copy its URL (top of the page), e.g. `https://lab-attendance-api.onrender.com`.
2. Render → **lab-attendance-web** → **Environment** → confirm `NEXT_PUBLIC_API_URL` equals that exact URL (with `https://`, no trailing slash).
3. If you changed it, click **Manual Deploy → Deploy latest commit** so the new value is baked into the build.

## Step 6 — Open the app

Visit the **lab-attendance-web** URL (e.g. `https://lab-attendance-web.onrender.com`). Share it — anyone can access it.

**Demo login (from the seed):**
- Admin: `admin@col.edu` / `password123`
- Change these passwords before real use.

---

## Notes & troubleshooting

- **Free-tier cold starts:** free services sleep after ~15 min idle and take ~30s to wake on the next request. The first load after idle is slow — this is normal. Upgrade the service to a paid instance to remove it.
- **Login/API errors right after deploy:** usually `NEXT_PUBLIC_API_URL` doesn't match the API URL (Step 5). Confirm it's the exact `https://…onrender.com` of the API, then redeploy the web service.
- **Database looks empty / no demo login:** check the **lab-attendance-api** build logs for the `db:deploy` output. If the first build couldn't reach the DB, trigger **Manual Deploy → Deploy latest commit** to re-run it.
- **"ALLOWED_CIDRS is not configured":** the value is empty. The Blueprint sets it to `0.0.0.0/0,::/0` (open); restore that under **Environment** if it was cleared.
- **Database SSL:** the Blueprint uses Render's *internal* DB URL, which needs no SSL. If you ever connect using the *external* URL, also set `DATABASE_SSL=1` on the service.
- **Custom domain:** add it under a service's **Settings → Custom Domains**; then update `NEXT_PUBLIC_API_URL` if the API domain changes.
