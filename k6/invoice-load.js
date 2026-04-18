import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 50,
  duration: '60s',
  thresholds: {
    http_req_duration: ['p(95)<2000'],
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
  const res = http.get(
    `${__ENV.BASE_URL || 'http://localhost:3001'}/api/v1/finance/invoices?limit=20&page=1`,
    { headers: { Authorization: `Bearer ${data.token}` } },
  );
  check(res, {
    'invoices 200': (r) => r.status === 200,
    'no 5xx errors': (r) => r.status < 500,
    'p95 < 2s': (r) => r.timings.duration < 2000,
  });
}
