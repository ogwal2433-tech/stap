module.exports = {
  apps: [
    {
      name: 'security360-api-dev',
      script: './apps/api/dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,

      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        REDIS_URL: 'redis://localhost:6379',
        DATABASE_URL: 'postgresql://security360_user:STRONG_DB_PASSWORD@localhost:5432/security360_production',
        JWT_SECRET: 'dev-jwt-secret',
        JWT_REFRESH_SECRET: 'dev-jwt-refresh-secret',
        COOKIE_SECRET: 'dev-cookie-secret',
        FRONTEND_URL: 'http://localhost:5173',
      },

      // Pipe all output to terminal so errors appear immediately
      error_file: '/dev/stderr',
      out_file: '/dev/stdout',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Crash fast — no silent restart loops hiding errors
      autorestart: false,

      // Show full untruncated stack traces
      node_args: '--stack-trace-limit=50',

      // Pipe PM2's own output to terminal as well
      combine_logs: true,
    },
    {
      name: 'security360-worker-dev',
      script: './apps/api/dist/worker.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,

      env: {
        NODE_ENV: 'development',
        REDIS_URL: 'redis://localhost:6379',
        DATABASE_URL: 'postgresql://security360_user:STRONG_DB_PASSWORD@localhost:5432/security360_production',
        JWT_SECRET: 'dev-jwt-secret',
        JWT_REFRESH_SECRET: 'dev-jwt-refresh-secret',
      },

      error_file: '/dev/stderr',
      out_file: '/dev/stdout',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      autorestart: false,
      node_args: '--stack-trace-limit=50',
      combine_logs: true,
    },
  ],
};
