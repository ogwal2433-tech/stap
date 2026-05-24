import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attendanceApi } from '../lib/attendance.api';
import type {
  CreateRosterInput,
  DeploymentListQuery,
  AttendanceQuery,
  MarkAttendanceInput,
  SupervisorCheckinInput,
} from '@stap/shared';
import { useToast } from '../context/ToastContext';

export function useTodaysDeployments(params?: Partial<DeploymentListQuery>) {
  return useQuery({
    queryKey: ['deployments-today', params],
    queryFn: () => attendanceApi.getTodaysDeployments(params),
    staleTime: 2 * 60 * 1000,
  });
}

export function useDailySheet(date?: string, siteId?: string) {
  return useQuery({
    queryKey: ['daily-sheet', date, siteId],
    queryFn: () => attendanceApi.getDailySheet(date, siteId),
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

export function useCopyRoster() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: ({ sourceDate, targetDate }: { sourceDate: string; targetDate: string }) =>
      attendanceApi.copyRoster(sourceDate, targetDate),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['daily-sheet'] });
      qc.invalidateQueries({ queryKey: ['deployments-today'] });
      showToast(`${data.created} deployment(s) copied, ${data.skipped} skipped`, 'success');
    },
  });
}

export function useAvailableReplacements(
  siteId: string,
  date: string,
  absentGuardId: string,
  enabled = false,
) {
  return useQuery({
    queryKey: ['replacements', siteId, date, absentGuardId],
    queryFn:  () => attendanceApi.getAvailableReplacements(siteId, date, absentGuardId),
    enabled:  enabled && Boolean(date) && Boolean(absentGuardId),
  });
}
