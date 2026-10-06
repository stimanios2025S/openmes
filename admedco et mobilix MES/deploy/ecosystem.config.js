/**
 * PM2 process definition for running the MES on a server.
 *
 * Start:   pm2 start deploy/ecosystem.config.js --env production
 * Reload:  pm2 reload admedco-mobilix-mes          (zero-downtime)
 * Logs:    pm2 logs admedco-mobilix-mes
 * Boot:    pm2 save && pm2 startup                  (then run the command it prints)
 *
 * Prerequisites on the host, once:
 *   npm ci
 *   npm run setup          # prisma generate + create the SQLite file + seed
 *   npm run build
 *
 * The app is a plain Next.js server with a SQLite file on disk - no Docker, no
 * PostgreSQL, no reverse proxy required to start.
 */
const { join } = require("node:path");

// Resolve from this file's own location so `pm2 start` works from any directory.
const projectRoot = join(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "admedco-mobilix-mes",
      cwd: projectRoot,
      // Absolute path to the project's own Next.js server, so the version in
      // node_modules is the one that starts (never a global install).
      script: join(projectRoot, "node_modules", "next", "dist", "bin", "next"),
      args: "start -p 3000",

      // One instance only: SQLite is a single-writer database, so clustering
      // would cause "database is locked" errors under load.
      instances: 1,
      exec_mode: "fork",

      // Restart on crash or memory growth, but back off so a bad build does not
      // spin the CPU in a restart loop.
      autorestart: true,
      max_memory_restart: "512M",
      restart_delay: 3000,
      max_restarts: 10,

      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },

      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
