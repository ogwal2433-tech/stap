import api from './api';
import type {
  ApplicantResponse,
  PipelineSummary,
  TrainingSessionResponse,
  LeaveRequestResponse,
  LeaveBalance,
  LetterTemplateResponse,
  PaginatedResponse,
  CreateApplicantInput,
  UpdateApplicantStageInput,
  DocumentVerificationInput,
  VettingRequirementsInput,
  CreateTrainingSessionInput,
  RecordTrainingResultsInput,
  CreateLeaveRequestInput,
  ApproveLeaveInput,
  SaveLetterTemplateInput,
  GuardResponse,
  CreateGuardInput,
} from '@stap/shared';

// ── Recruitment ────────────────────────────────────────────────────────────────

/** A member of staff, as the facilitator dropdown and staff attendee list need them. */
export interface Facilitator {
  id:       string;
  name:     string;
  role:     string;
  jobTitle: string | null;
}

export const hrApi = {
  listApplicants(params?: { stage?: string; page?: number; limit?: number }) {
    return api
      .get<{ success: boolean } & PaginatedResponse<ApplicantResponse>>('/hr/applicants', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  createApplicant(data: CreateApplicantInput): Promise<ApplicantResponse> {
    return api
      .post<{ success: boolean; data: ApplicantResponse }>('/hr/applicants', data)
      .then((r) => r.data.data);
  },

  updateStage(id: string, data: UpdateApplicantStageInput): Promise<ApplicantResponse> {
    return api
      .patch<{ success: boolean; data: ApplicantResponse }>(`/hr/applicants/${id}/stage`, data)
      .then((r) => r.data.data);
  },

  convertToGuard(id: string, data: CreateGuardInput): Promise<GuardResponse> {
    return api
      .post<{ success: boolean; data: GuardResponse }>(`/hr/applicants/${id}/convert`, data)
      .then((r) => r.data.data);
  },

  getApplicant(id: string): Promise<ApplicantResponse> {
    return api
      .get<{ success: boolean; data: ApplicantResponse }>(`/hr/applicants/${id}`)
      .then((r) => r.data.data);
  },

  getPipelineSummary(): Promise<PipelineSummary> {
    return api
      .get<{ success: boolean; data: PipelineSummary }>('/hr/applicants/pipeline')
      .then((r) => r.data.data);
  },

  verifyDocuments(id: string, data: DocumentVerificationInput): Promise<ApplicantResponse> {
    return api
      .patch<{ success: boolean; data: ApplicantResponse }>(`/hr/applicants/${id}/verify-documents`, data)
      .then((r) => r.data.data);
  },

  updateVettingRequirements(id: string, data: VettingRequirementsInput): Promise<ApplicantResponse> {
    return api
      .patch<{ success: boolean; data: ApplicantResponse }>(`/hr/applicants/${id}/vetting-requirements`, data)
      .then((r) => r.data.data);
  },

  uploadApplicationLetter(id: string, file: File): Promise<ApplicantResponse> {
    const fd = new FormData();
    fd.append('file', file);
    return api
      .post<{ success: boolean; data: ApplicantResponse }>(`/hr/applicants/${id}/application-letter`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data);
  },

  uploadVettingForm(id: string, file: File): Promise<ApplicantResponse> {
    const fd = new FormData();
    fd.append('file', file);
    return api
      .post<{ success: boolean; data: ApplicantResponse }>(`/hr/applicants/${id}/vetting-form`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data);
  },

  // ── Training ────────────────────────────────────────────────────────────────

  /**
   * Everyone who may facilitate a session — every active member of staff, not
   * only those holding the TRAINER role. Doubles as the attendee list for a
   * staff session, since both want the same people.
   */
  getFacilitators(): Promise<Facilitator[]> {
    return api
      .get<{ success: boolean; data: Facilitator[] }>('/hr/trainers')
      .then((r) => r.data.data);
  },

  listSessions(params?: {
    status?: string;
    targetGroup?: string;
    facilitatorUserId?: string;
    page?: number;
    limit?: number;
  }) {
    return api
      .get<{ success: boolean } & PaginatedResponse<TrainingSessionResponse>>('/hr/training', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  createSession(data: CreateTrainingSessionInput): Promise<TrainingSessionResponse> {
    return api
      .post<{ success: boolean; data: TrainingSessionResponse }>('/hr/training', data)
      .then((r) => r.data.data);
  },

  recordResults(id: string, data: RecordTrainingResultsInput): Promise<TrainingSessionResponse> {
    return api
      .patch<{ success: boolean; data: TrainingSessionResponse }>(`/hr/training/${id}/results`, data)
      .then((r) => r.data.data);
  },

  // ── Leave ────────────────────────────────────────────────────────────────────

  listLeaveRequests(params?: { guardId?: string; status?: string; type?: string; page?: number; limit?: number }) {
    return api
      .get<{ success: boolean } & PaginatedResponse<LeaveRequestResponse>>('/hr/leave', { params })
      .then((r) => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  requestLeave(data: CreateLeaveRequestInput): Promise<LeaveRequestResponse> {
    return api
      .post<{ success: boolean; data: LeaveRequestResponse }>('/hr/leave', data)
      .then((r) => r.data.data);
  },

  approveLeave(id: string, data: ApproveLeaveInput): Promise<LeaveRequestResponse> {
    return api
      .patch<{ success: boolean; data: LeaveRequestResponse }>(`/hr/leave/${id}/approve`, data)
      .then((r) => r.data.data);
  },

  getLeaveBalance(guardId: string): Promise<LeaveBalance> {
    return api
      .get<{ success: boolean; data: LeaveBalance }>(`/hr/leave/${guardId}/balance`)
      .then((r) => r.data.data);
  },

  // ── Letter Templates ─────────────────────────────────────────────────────────

  listTemplates(): Promise<LetterTemplateResponse[]> {
    return api
      .get<{ success: boolean; data: LetterTemplateResponse[] }>('/hr/templates')
      .then((r) => r.data.data);
  },

  getTemplate(letterType: string): Promise<LetterTemplateResponse | null> {
    return api
      .get<{ success: boolean; data: LetterTemplateResponse | null }>(`/hr/templates/${letterType}`)
      .then((r) => r.data.data);
  },

  saveTemplate(letterType: string, data: Omit<SaveLetterTemplateInput, 'letterType'>): Promise<LetterTemplateResponse> {
    return api
      .put<{ success: boolean; data: LetterTemplateResponse }>(`/hr/templates/${letterType}`, {
        ...data,
        letterType,
      })
      .then((r) => r.data.data);
  },

  previewTemplate(letterType: string, sampleData: Record<string, string>): Promise<string> {
    return api
      .post<string>(`/hr/templates/${letterType}/preview`, { sampleData }, {
        headers: { Accept: 'text/html' },
        responseType: 'text',
      })
      .then((r) => r.data);
  },
};
