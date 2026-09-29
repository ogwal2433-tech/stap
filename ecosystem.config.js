module.exports = {
  apps: [
    {
      name: 'security360-api',
      script: './apps/api/dist/index.js',
      instances: 2,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        REDIS_URL: 'redis://localhost:6379',
        DATABASE_URL: 'postgresql://security360_user:YOUR_DB_PASSWORD@localhost:5432/security360_production',
        JWT_SECRET: 'YOUR_JWT_SECRET_HERE',
        JWT_REFRESH_SECRET: 'YOUR_JWT_REFRESH_SECRET_HERE',
        COOKIE_SECRET: 'YOUR_COOKIE_SECRET_HERE',
        // FRONTEND_URL: 'http://185.194.218.245',
        FRONTEND_URL: 'localhost:5000'
      },
      error_file: '/var/log/security360/api-error.log',
      out_file: '/var/log/security360/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
    },
    {
      name: 'security360-worker',
      script: './apps/api/dist/worker.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '300M',
      env_production: {
        NODE_ENV: 'production',
        REDIS_URL: 'redis://localhost:6379',
        DATABASE_URL: 'postgresql://security360_user:YOUR_DB_PASSWORD@localhost:5432/security360_production',
        JWT_SECRET: 'YOUR_JWT_SECRET_HERE',
        JWT_REFRESH_SECRET: 'YOUR_JWT_REFRESH_SECRET_HERE',
      },
      error_file: '/var/log/security360/worker-error.log',
      out_file: '/var/log/security360/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      autorestart: true,
    }
  ]
}