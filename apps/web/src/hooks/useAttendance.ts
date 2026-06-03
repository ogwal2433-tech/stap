import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attendanceApi } from '../lib/attendance.api';
import type {
  CreateRosterInput,
  DeploymentListQuery,
  AttendanceQuery,
  MarkAttendanceInput,
  SupervisorCheckinInput,
} from '@stap/shared';

export function useTodaysDeployments(params?: Partial<DeploymentListQuery>) {
  return useQuery({
    queryKey: ['deployments-today', params],
    queryFn: () => attendanceApi.getTodaysDeployments(params),
    staleTime: 2 * 60 * 1000,
  });
}

export function useDailySheet(date?: string, siteId?: string, zoneId?: string) {
  return useQuery({
    queryKey: ['daily-sheet', date, siteId, zoneId],
    queryFn:  () => attendanceApi.getDailySheet(date, siteId, zoneId),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useCreateRoster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRosterInput) => attendanceApi.createRoster(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments-today'] });
      queryClient.invalidateQueries({ queryKey: ['daily-sheet'] });
    },
  });
}

export function useDeleteDeployment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => attendanceApi.deleteDeployment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments-today'] });
      queryClient.invalidateQueries({ queryKey: ['daily-sheet'] });
    },
  });
}

export function useMarkAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (records: MarkAttendanceInput['records']) =>
      attendanceApi.markAttendance(records),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['deployments-today'] });
      queryClient.invalidateQueries({ queryKey: ['daily-sheet'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['director-dashboard'] });
    },
  });
}

export function useAttendance(params?: Partial<AttendanceQuery>) {
  return useQuery({
    queryKey: ['attendance', params],
    queryFn: () => attendanceApi.getAttendance(params),
  });
}

export function useAttendanceSummary(
  from: string,
  to: string,
  guardId?: string,
  siteId?: string,
) {
  return useQuery({
    queryKey: ['attendance-summary', from, to, guardId, siteId],
    queryFn: () => attendanceApi.getAttendanceSummary(from, to, guardId, siteId),
    enabled: Boolean(from && to),
  });
}

export function useSubmitCheckin() {
  return useMutation({
    mutationFn: ({ data, photo }: { data: SupervisorCheckinInput; photo?: File }) =>
      attendanceApi.submitCheckin(data, photo),
  });
}

export function useUpcomingDeployments(guardId: string, days = 7) {
  return useQuery({
    queryKey: ['upcoming-deployments', guardId, days],
    queryFn: () => attendanceApi.getUpcomingDeployments(guardId, days),
    enabled: Boolean(guardId),
  });
}

export function useAttendanceDashboard() {
  return useQuery({
    queryKey: ['attendance-dashboard'],
    queryFn:  () => attendanceApi.getAttendanceDashboard(),
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
}
