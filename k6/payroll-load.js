import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 10,
  duration: '60s',
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  const res = http.post(
    `${__ENV.BASE_URL || 'http://localhost:3001'}/api/v1/auth/login`,
    JSON.stringify({ email: 'director@stapsecurity.co.ug', password: '12345678' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  return { token: res.json('data.accessToken') };
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };
  const now = new Date();
  const res = http.post(
    `${__ENV.BASE_URL || 'http://localhost:3001'}/api/v1/finance/payroll/calculate`,
    JSON.stringify({ month: now.getMonth() + 1, year: now.getFullYear() }),
    { headers },
  );
  check(res, {
    'status valid (201 created or 409 duplicate)': (r) => [201, 409].includes(r.status),
    'response time < 3s': (r) => r.timings.duration < 3000,
  });
}
