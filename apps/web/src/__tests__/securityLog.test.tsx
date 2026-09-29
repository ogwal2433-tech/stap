import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SecurityLogResult } from '@security360/shared';
import SecurityLogPage from '../pages/admin/SecurityLogPage';

const h = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }));

const RESULT: SecurityLogResult = {
  data: [
    {
      id: 'e1', action: 'PERMISSION_DENIED', createdAt: '2026-09-19T08:15:00.000Z',
      user: { id: 'u1', name: 'Betty Nakiwala', email: 'controlroom@example.com' },
      role: 'CONTROL_ROOM', required: 'clients.edit', method: 'PATCH', path: '/api/v1/clients/abc',
      ipAddress: '41.210.1.7', userAgent: null, reason: null,
    },
    {
      id: 'e2', action: 'UNAUTHORISED_ACCESS', createdAt: '2026-09-19T08:16:00.000Z',
      user: null, role: null, required: 'authentication', method: 'GET', path: '/api/v1/guards',
      ipAddress: '102.8.9.10', userAgent: null, reason: 'No token',
    },
  ],
  total: 2, page: 1, pages: 1,
  summary: { days: 7, byRole: [{ role: 'CONTROL_ROOM', count: 4 }], byAction: [{ action: 'PERMISSION_DENIED', count: 4 }] },
};

vi.mock('../lib/auditLogs.api', () => ({
  auditLogsApi: {
    security: (params: Record<string, unknown>) => { h.calls.push(params); return Promise.resolve(RESULT); },
  },
}));
vi.mock('../hooks/useRoles', () => ({
  useRoles: () => ({ data: [{ name: 'CONTROL_ROOM', label: 'Control Room' }, { name: 'ZZ_CUSTOM', label: 'Custom Role' }] }),
}));

const draw = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <SecurityLogPage />
  </QueryClientProvider>,
);

beforeEach(() => { h.calls = []; });

describe('Security Log page', () => {
  it('shows who was refused, from which role, what they lacked, and where', async () => {
    draw();
    expect(await screen.findByText('Betty Nakiwala')).toBeInTheDocument();
    expect(screen.getByText('clients.edit')).toBeInTheDocument();
    expect(screen.getByText('/api/v1/clients/abc')).toBeInTheDocument();
    expect(screen.getByText('41.210.1.7')).toBeInTheDocument();
    // An unauthenticated attempt has no user to name.
    expect(screen.getAllByText('Not signed in').length).toBeGreaterThan(0);
    expect(screen.getByText('2 events')).toBeInTheDocument();
  });

  it('summarises denials by role', async () => {
    draw();
    expect(await screen.findByText('Denials by role, last 7 days')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('filters by event, and offers every role from the Role table', async () => {
    draw();
    await screen.findByText('Betty Nakiwala');
    // A custom role is listed, not just the built-in ones.
    expect(screen.getByRole('option', { name: 'Custom Role' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Event'), { target: { value: 'INVALID_TOKEN' } });
    await waitFor(() => expect(h.calls.at(-1)).toMatchObject({ action: 'INVALID_TOKEN', page: 1 }));
  });
});

describe('access', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

  it('the page and its link ask for audit.log', () => {
    expect(read('App.tsx')).toMatch(/<Route path="\/admin\/security-log"[^\n]*permission="audit\.log"/);
    const sidebar = read('components/layout/Sidebar.tsx');
    expect(sidebar).toMatch(/to: '\/admin\/security-log', permission: 'audit\.log'/);
  });
});
