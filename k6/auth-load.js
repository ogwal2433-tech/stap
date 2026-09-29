import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m',  target: 20 },
    { duration: '30s', target: 0  },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    errors: ['rate<0.05'],
  },
};

export function setup() {
  const res = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: 'director@security360.co.ug', password: '12345678' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const token = res.json('data.accessToken');
  if (!token) throw new Error('Login failed in setup');
  return { token };
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  // Health check
  let res = http.get(`${BASE_URL}/api/v1/health`);
  errorRate.add(!check(res, { 'health 200': (r) => r.status === 200 }));

  // List guards
  res = http.get(`${BASE_URL}/api/v1/guards?limit=20`, { headers });
  errorRate.add(!check(res, {
    'guards 200': (r) => r.status === 200,
    'guards < 2s': (r) => r.timings.duration < 2000,
  }));

  // Today's attendance
  res = http.get(`${BASE_URL}/api/v1/attendance/today`, { headers });
  errorRate.add(!check(res, { 'attendance 200': (r) => r.status === 200 }));

  sleep(1);
}
