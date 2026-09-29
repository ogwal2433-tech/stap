import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hrApi } from '../lib/hr.api';
import type {
  CreateApplicantInput,
  UpdateApplicantStageInput,
  DocumentVerificationInput,
  VettingRequirementsInput,
  CreateTrainingSessionInput,
  RecordTrainingResultsInput,
  CreateLeaveRequestInput,
  ApproveLeaveInput,
  SaveLetterTemplateInput,
  CreateGuardInput,
} from '@security360/shared';

// ── Recruitment ────────────────────────────────────────────────────────────────

export function useApplicants(params?: Parameters<typeof hrApi.listApplicants>[0]) {
  return useQuery({
    queryKey: ['applicants', params],
    queryFn:  () => hrApi.listApplicants(params),
  });
}

export function useApplicant(id: string) {
  return useQuery({
    queryKey: ['applicant', id],
    queryFn:  () => hrApi.getApplicant(id),
    enabled:  !!id,
  });
}

export function usePipelineSummary() {
  return useQuery({
    queryKey: ['applicants', 'pipeline'],
    queryFn:  () => hrApi.getPipelineSummary(),
  });
}

export function useCreateApplicant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateApplicantInput) => hrApi.createApplicant(data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['applicants'] });
    },
  });
}

export function useUpdateApplicantStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateApplicantStageInput }) =>
      hrApi.updateStage(id, data),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['applicants'] });
      qc.invalidateQueries({ queryKey: ['applicant', vars.id] });
    },
  });
}

export function useVerifyDocuments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DocumentVerificationInput }) =>
      hrApi.verifyDocuments(id, data),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['applicants'] });
      qc.invalidateQueries({ queryKey: ['applicant', vars.id] });
    },
  });
}

export function useUpdateVettingRequirements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: VettingRequirementsInput }) =>
      hrApi.updateVettingRequirements(id, data),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['applicants'] });
      qc.invalidateQueries({ queryKey: ['applicant', vars.id] });
    },
  });
}

export function useUploadApplicationLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      hrApi.uploadApplicationLetter(id, file),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['applicant', vars.id] });
    },
  });
}

export function useUploadVettingForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      hrApi.uploadVettingForm(id, file),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['applicant', vars.id] });
    },
  });
}

export function useConvertToGuard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateGuardInput }) =>
      hrApi.convertToGuard(id, data),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['applicants'] });
      qc.invalidateQueries({ queryKey: ['applicant', vars.id] });
      qc.invalidateQueries({ queryKey: ['guards'] });
    },
  });
}

// ── Training ───────────────────────────────────────────────────────────────────

/** Staff who can facilitate a session, and who can attend a staff session. */
export function useFacilitators() {
  return useQuery({
    queryKey: ['hr-facilitators'],
    queryFn:  () => hrApi.getFacilitators(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useTrainingSessions(params?: Parameters<typeof hrApi.listSessions>[0]) {
  return useQuery({
    queryKey: ['training-sessions', params],
    queryFn:  () => hrApi.listSessions(params),
  });
}

export function useCreateTrainingSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTrainingSessionInput) => hrApi.createSession(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['training-sessions'] }),
  });
}

export function useRecordTrainingResults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RecordTrainingResultsInput }) =>
      hrApi.recordResults(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training-sessions'] }),
  });
}

// ── Leave ──────────────────────────────────────────────────────────────────────

export function useLeaveRequests(params?: Parameters<typeof hrApi.listLeaveRequests>[0]) {
  return useQuery({
    queryKey: ['leave-requests', params],
    queryFn:  () => hrApi.listLeaveRequests(params),
  });
}

export function useLeaveBalance(guardId: string) {
  return useQuery({
    queryKey: ['leave-balance', guardId],
    queryFn:  () => hrApi.getLeaveBalance(guardId),
    enabled:  !!guardId,
  });
}

export function useRequestLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLeaveRequestInput) => hrApi.requestLeave(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['leave-requests'] }),
  });
}

export function useApproveLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ApproveLeaveInput }) =>
      hrApi.approveLeave(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-requests'] }),
  });
}

// ── Letter Templates ───────────────────────────────────────────────────────────

export function useLetterTemplates() {
  return useQuery({
    queryKey: ['letter-templates'],
    queryFn:  () => hrApi.listTemplates(),
  });
}

export function useLetterTemplate(letterType: string) {
  return useQuery({
    queryKey: ['letter-templates', letterType],
    queryFn:  () => hrApi.getTemplate(letterType),
    enabled:  !!letterType,
  });
}

export function useSaveLetterTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      letterType,
      data,
    }: {
      letterType: string;
      data: Omit<SaveLetterTemplateInput, 'letterType'>;
    }) => hrApi.saveTemplate(letterType, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['letter-templates'] }),
  });
}

export function usePreviewTemplate() {
  return useMutation({
    mutationFn: ({
      letterType,
      sampleData,
    }: {
      letterType: string;
      sampleData: Record<string, string>;
    }) => hrApi.previewTemplate(letterType, sampleData),
  });
}
