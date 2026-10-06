# Deployment — ADMEDCO & MOBILIX MES

The app is a single Next.js server with a SQLite file on disk. There is no
Docker, no PostgreSQL and no Caddy: on a server it is one Node process plus a
PM2 supervisor.

## 1. Prepare the host (once)

```bash
npm ci                 # install exactly what package-lock.json pins
npm run setup          # prisma generate + create prisma/dev.db + seed
npm run build          # production build
```

Before the first `npm run setup`, copy `.env.example` to `.env` and set your own
`SEED_*` credentials — the seed only reads them when an account is first created.

## 2. Run it under PM2

```bash
npm install -g pm2
pm2 start deploy/ecosystem.config.js --env production
pm2 save
pm2 startup            # then run the command it prints
```

Useful day-to-day commands:

| Task | Command |
|---|---|
| Status | `pm2 status` |
| Live logs | `pm2 logs admedco-mobilix-mes` |
| Zero-downtime reload after a rebuild | `pm2 reload admedco-mobilix-mes` |
| Stop / start | `pm2 stop admedco-mobilix-mes` / `pm2 start admedco-mobilix-mes` |

## 3. Deploy a new version

```bash
git pull
npm ci
npm run setup          # safe when the schema is unchanged; migrates nothing destructive
npm run build
pm2 reload admedco-mobilix-mes
```

## Behind a reverse proxy

Terminate TLS in front of the app (Caddy, nginx, Cloudflare Tunnel, …) and proxy
to `http://127.0.0.1:3000`. The app sets `secure` cookies automatically when
`NODE_ENV=production`, so it must be reached over HTTPS in production.

## Backups

All state is in `prisma/dev.db` (git-ignored). Back it up with the SQLite
backup command rather than a plain copy, so a running write does not corrupt it:

```bash
sqlite3 prisma/dev.db ".backup '/backups/mes-$(date +%F).db'"
```

## Scaling caveat

SQLite is a single-writer database. Keep `instances: 1` in the PM2 config; do not
switch to cluster mode. For multiple app servers or high write volume, the data
layer would need to move to PostgreSQL first.
