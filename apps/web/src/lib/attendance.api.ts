import api from './api';
import type {
  CreateRosterInput,
  ConflictDetail,
  DeploymentResponse,
  AttendanceRecord,
  AttendanceSummary,
  CheckinResponse,
  DailySheetResponse,
  AttendanceDashboardData,
  PaginatedResponse,
  DeploymentListQuery,
  AttendanceQuery,
  SupervisorCheckinInput,
  MarkAttendanceInput,
} from '@stap/shared';

export const attendanceApi = {
  createRoster(data: CreateRosterInput): Promise<{ created: number; conflicts: ConflictDetail[] }> {
    return api
      .post<{ success: boolean; data: { created: number; conflicts: ConflictDetail[] } }>(
        '/attendance/roster',
        data,
      )
      .then((r) => r.data.data);
  },

  getTodaysDeployments(params?: Partial<DeploymentListQuery>): Promise<PaginatedResponse<DeploymentResponse>> {
    return api
      .get<{ success: boolean } & PaginatedResponse<DeploymentResponse>>('/attendance/today', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  getDailySheet(date?: string, siteId?: string, zoneId?: string): Promise<DailySheetResponse> {
    return api
      .get<{ success: boolean; data: DailySheetResponse }>('/attendance/sheet', {
        params: { date, siteId, zoneId },
      })
      .then((r) => r.data.data);
  },

  deleteDeployment(id: string): Promise<void> {
    return api.delete(`/attendance/deployments/${id}`).then(() => undefined);
  },

  markAttendance(records: MarkAttendanceInput['records']): Promise<{ marked: number; updated: number }> {
    return api
      .post<{ success: boolean; data: { marked: number; updated: number } }>(
        '/attendance/attendance/mark',
        { records },
      )
      .then((r) => r.data.data);
  },

  getAttendance(params?: Partial<AttendanceQuery>): Promise<PaginatedResponse<AttendanceRecord>> {
    return api
      .get<{ success: boolean } & PaginatedResponse<AttendanceRecord>>('/attendance/attendance', {
        params,
      })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  getAttendanceSummary(
    from: string,
    to: string,
    guardId?: string,
    siteId?: string,
  ): Promise<AttendanceSummary[]> {
    return api
      .get<{ success: boolean; data: AttendanceSummary[] }>('/attendance/attendance/summary', {
        params: { from, to, guardId, siteId },
      })
      .then((r) => r.data.data);
  },

  submitCheckin(data: SupervisorCheckinInput, photo?: File): Promise<CheckinResponse> {
    if (photo) {
      const form = new FormData();
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined) form.append(k, String(v));
      });
      form.append('photo', photo);
      return api
        .post<{ success: boolean; data: CheckinResponse }>('/attendance/checkin', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((r) => r.data.data);
    }
    return api
      .post<{ success: boolean; data: CheckinResponse }>('/attendance/checkin', data)
      .then((r) => r.data.data);
  },

  getUpcomingDeployments(guardId: string, days = 7): Promise<DeploymentResponse[]> {
    return api
      .get<{ success: boolean; data: DeploymentResponse[] }>(
        `/attendance/guards/${guardId}/upcoming`,
        { params: { days } },
      )
      .then((r) => r.data.data);
  },

  getAttendanceDashboard(): Promise<AttendanceDashboardData> {
    return api
      .get<{ success: boolean; data: AttendanceDashboardData }>('/attendance/dashboard')
      .then((r) => r.data.data);
  },
};
