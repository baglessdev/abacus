# Deploy Abacus to Vercel + Neon

The canonical deployment runbook for Abacus. Production is hosted on **Vercel** (Next.js runtime, automatic HTTPS, preview deploys per PR); Postgres lives on **Neon** (serverless Postgres with pooled connections).

This runbook is one-time setup. After that, every push to `main` deploys to production and every PR gets its own preview URL.

---

## What you'll create

| Provider | Resource                          | Cost (idle)                             |
| -------- | --------------------------------- | --------------------------------------- |
| Neon     | Project + database                | Free tier (sufficient for personal use) |
| Vercel   | Project linked to the GitHub repo | Free tier (Hobby)                       |
| Total    |                                   | **$0 / month**                          |

The free tiers cover single-user / low-traffic personal use indefinitely. If you outgrow them, both providers charge in clear increments.

---

## Step 1 — Create the Neon project

1. Sign up at <https://console.neon.tech> (GitHub OAuth is the fastest).
2. Create a project:
   - Name: `abacus` (or whatever).
   - Postgres version: **16** (matches local docker-compose; constitution requires it).
   - Region: pick the one closest to where Vercel will deploy you (Vercel defaults to `iad1` — US East).
3. On the project dashboard, find the **Connection string** panel. Copy two values:
   - **Pooled connection string** — used at runtime by serverless functions. Looks like:
     ```
     postgresql://USER:PASS@ep-xxx-pooler.us-east-1.aws.neon.tech/abacus?sslmode=require
     ```
   - **Direct connection string** — used by Prisma for migrations. Same host without `-pooler`:
     ```
     postgresql://USER:PASS@ep-xxx.us-east-1.aws.neon.tech/abacus?sslmode=require
     ```

   You'll paste these into Vercel in Step 2. Keep them in a password manager — they include the DB password.

**Note**: Neon's free tier includes one project + one branch (`main`). Database branching is available but not used by this setup.

---

## Step 2 — Create the Vercel project

1. Sign up / log in at <https://vercel.com>.
2. Click **Add New → Project**. Select **Import** next to your `abacus` GitHub repo.
3. On the import screen:
   - Framework Preset: **Next.js** (auto-detected).
   - Root Directory: leave as `.` (the repo root).
   - Build & Output Settings: leave as default. `vercel.json` in the repo overrides the build command to run Prisma generate + migrate deploy before `next build`.
4. **Environment Variables** — add these BEFORE clicking Deploy. Click "Environment Variables" and add three:

   | Name           | Value                                                                | Environments                     |
   | -------------- | -------------------------------------------------------------------- | -------------------------------- |
   | `DATABASE_URL` | the **pooled** connection string from Neon                           | Production, Preview, Development |
   | `DIRECT_URL`   | the **direct** connection string from Neon                           | Production, Preview, Development |
   | `AUTH_SECRET`  | generate with `openssl rand -base64 32` (must be ≥32 chars)          | Production, Preview, Development |
   | `AUTH_URL`     | `https://<your-project>.vercel.app` (you'll know after first deploy) | **Production only**              |

   Notes:
   - **AUTH_SECRET** must be ≥32 characters (validated by `lib/env.ts`).
   - **AUTH_URL** is set for Production only. For Preview deploys, leave it unset — NextAuth v5 will fall back to the request's `Host` header so cookies are scoped correctly to each preview URL. (If you set AUTH_URL on Preview, every preview would issue cookies for the production domain, breaking auth on previews.)
   - `DIRECT_URL` is used during the build for `prisma migrate deploy`. `DATABASE_URL` is used at runtime by every serverless function.

5. Click **Deploy**. The first deploy will fail because `AUTH_URL` isn't set yet (you don't know the URL). That's expected — see Step 3.

---

## Step 3 — Set AUTH_URL and redeploy

1. After the first deploy attempt, note the URL Vercel assigned, e.g. `https://abacus-baglessdev.vercel.app`.
2. Go to **Project Settings → Environment Variables**.
3. Add `AUTH_URL = https://<your-project>.vercel.app` to the **Production** environment.
4. Trigger a new deploy: **Deployments → ⋯ on the latest → Redeploy**, or push any commit to `main`.

The deploy should now succeed end-to-end:

- `pnpm install --frozen-lockfile` runs.
- `pnpm db:generate && pnpm exec prisma migrate deploy --schema=db/schema.prisma` applies any pending migrations (the `add_user` migration on the first deploy).
- `pnpm build` produces the Next.js production bundle.
- Vercel serves at `https://<your-project>.vercel.app`.

---

## Step 4 — Verify production

1. Visit `https://<your-project>.vercel.app` — should render the marketing home with the violet primary brand.
2. Click **Sign up** — should land at `/signup`.
3. Submit a valid email + 12+-char password — should auto-sign-in and land at `/dashboard`.
4. Hit `https://<your-project>.vercel.app/api/health` — should return `{"data":{"app":"ok","database":"ok"}}` with HTTP 200.
5. Open Neon → SQL Editor → run `select email from "User";` — should show the user you just created.

If any of those fail:

- Check **Deployments → latest → Logs** in Vercel for the build / runtime output.
- Check **Functions** tab for runtime errors on `/api/health` or `/api/auth/*`.
- Check Neon's **Monitoring** for connection issues.

---

## Step 5 — Preview deploys (automatic)

Every PR opened against `main` gets its own preview URL like:

```
https://abacus-git-<branch-slug>-<account>.vercel.app
```

Preview deploys:

- Use the same `DATABASE_URL` and `DIRECT_URL` as production by default — **WARNING**: this means preview deploys can write to the production database. For a personal app at this stage, that's acceptable; once you have real users, configure a separate Neon branch for previews and override `DATABASE_URL` / `DIRECT_URL` in the Vercel **Preview** environment.
- Have a fresh `AUTH_SECRET` (Preview env uses the same value as Production unless you override).
- Do NOT have `AUTH_URL` set (intentional — see Step 2 notes), so NextAuth falls back to the request host for cookies.

Each preview URL is publicly browsable. Share the link to demo PR changes before merge.

---

## Custom domain (optional)

If you own a domain like `abacus.app`:

1. Vercel project → **Settings → Domains** → Add the domain.
2. Vercel shows the DNS records to set. Either:
   - **Apex domain** (`abacus.app`): point an `A` record at Vercel's IP, OR
   - **Subdomain** (`app.abacus.app`): add a `CNAME` to `cname.vercel-dns.com`.
3. Wait for DNS propagation (usually 1–10 minutes). Vercel auto-provisions SSL via Let's Encrypt.
4. Update `AUTH_URL` in Vercel Production env to `https://abacus.app` (or whatever your custom domain is).
5. Redeploy.

Once the custom domain is verified, the `*.vercel.app` URL still works but the canonical URL is the custom one.

---

## Rotating secrets

### `AUTH_SECRET`

If you need to rotate (suspected leak, periodic rotation):

1. Generate a new value: `openssl rand -base64 32`.
2. Vercel → Environment Variables → edit `AUTH_SECRET` → update to the new value.
3. Redeploy. **All existing user sessions will be invalidated immediately** because JWTs were signed with the old secret. Users will be redirected to `/login` on their next request.

### `DATABASE_URL` / `DIRECT_URL`

If you need to rotate the database password:

1. Neon → Project Settings → Reset Password.
2. Copy the new pooled + direct connection strings.
3. Vercel → Environment Variables → update both `DATABASE_URL` and `DIRECT_URL`.
4. Redeploy. There's a brief gap (seconds) where in-flight requests with the old password may fail. For a personal app, that's acceptable.

---

## Database backups

Neon has a built-in **Point-in-Time Recovery (PITR)** feature with a 7-day window on the free tier (longer on paid). To restore:

1. Neon → Restore → pick a timestamp within the PITR window.
2. Neon creates a restored database. Update `DATABASE_URL` / `DIRECT_URL` to point at the restored DB.

For one-off SQL dumps:

```sh
# Dump
pg_dump "$NEON_DIRECT_URL" > backup-$(date +%Y%m%d).sql

# Restore (to a new Neon project or different DB)
psql "$NEW_NEON_DIRECT_URL" < backup-20260516.sql
```

Use the **direct** URL for `pg_dump` and `psql`, not the pooled URL.

---

## Cost expectations

| Trigger                           | Vercel free tier                                                                            | Neon free tier                      |
| --------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------- |
| Personal use (~10 page loads/day) | Well within                                                                                 | Well within                         |
| 100 visits/day from a launch      | Within                                                                                      | Within                              |
| 1000 visits/day sustained         | Within Bandwidth (100 GB/mo); may approach the 6,000 serverless function invocation/day cap | Within compute hours (191.9 hrs/mo) |
| 10,000 visits/day                 | Pro plan needed ($20/mo)                                                                    | Launch plan needed (~$19/mo)        |

Set up Vercel billing notifications and Neon usage alerts to catch surprises.

---

## Known limitations of this setup

- **Preview deploys share the production database** by default. For a personal app this is acceptable; flag if you onboard real users.
- **Preview deploys don't have a stable AUTH_URL** — auth flows work because NextAuth falls back to the request host, but be aware that auth cookies are scoped to each preview's unique URL.
- **No Sentry / observability** — runtime errors only surface in Vercel's Functions tab. A future chore can wire Sentry when needed.
- **No staging environment** — production is fed directly from `main`. PRs preview against the live DB. The next step up is a dedicated `staging` Neon branch + a Vercel staging environment, but that's a separate chore.

---

## Quick reference

| Action                | Where                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| View deploys          | Vercel → Project → Deployments                                            |
| View runtime logs     | Vercel → Project → Functions → click a function                           |
| View Postgres metrics | Neon → Project → Monitoring                                               |
| Restore database      | Neon → Restore                                                            |
| Edit env vars         | Vercel → Project Settings → Environment Variables                         |
| Open SQL console      | Neon → Project → SQL Editor                                               |
| Roll back deploy      | Vercel → Deployments → ⋯ on a healthy past deploy → Promote to Production |
