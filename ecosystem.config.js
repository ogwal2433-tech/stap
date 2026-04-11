/**
 * PM2 Ecosystem Configuration — STAP Security
 *
 * Usage:
 *   Development:  pm2 start ecosystem.config.js
 *   Production:   pm2 start ecosystem.config.js --env production
 *   Reload:       pm2 reload ecosystem.config.js --env production
 *   Logs:         pm2 logs
 *
 * Prerequisites (production):
 *   sudo mkdir -p /var/log/stap
 *   sudo chown $USER:$USER /var/log/stap
 */

module.exports = {
  apps: [
    // ── API HTTP server ─────────────────────────────────────────────────────────
    {
      name: 'stap-api',
      script: './apps/api/dist/index.js',

      // Cluster mode (2 instances) in production; fork (1 instance) in development
      instances: process.env.NODE_ENV === 'production' ? 2 : 1,
      exec_mode: process.env.NODE_ENV === 'production' ? 'cluster' : 'fork',

      watch: false,
      max_memory_restart: '500M',

      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },

      error_file: '/var/log/stap/api-error.log',
      out_file: '/var/log/stap/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
    },

    // ── BullMQ background worker process ───────────────────────────────────────
    {
      name: 'stap-worker',
      script: './apps/api/dist/worker.js',

      // Always single-instance fork — workers must not be clustered
      instances: 1,
      exec_mode: 'fork',

      watch: false,
      max_memory_restart: '300M',

      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },

      error_file: '/var/log/stap/worker-error.log',
      out_file: '/var/log/stap/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
