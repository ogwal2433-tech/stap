import api from './api';
import type {
  GenerateLetterInput,
  ApproveLetterInput,
  GeneratedLetterResponse,
  PaginatedResponse,
} from '@stap/shared';

export const lettersApi = {
  generate(data: GenerateLetterInput): Promise<GeneratedLetterResponse> {
    return api
      .post<{ success: boolean; data: GeneratedLetterResponse }>('/letters', data)
      .then(r => r.data.data);
  },

  list(params?: {
    subjectId?:           string;
    approvalStatus?:      string;
    letterType?:          string;
    disciplinaryRecordId?:string;
    isDisciplinary?:      boolean;
    page?:                number;
    limit?:               number;
  }): Promise<{ data: GeneratedLetterResponse[]; pagination: PaginatedResponse<GeneratedLetterResponse>['pagination'] }> {
    return api
      .get<{ success: boolean } & PaginatedResponse<GeneratedLetterResponse>>('/letters', { params })
      .then(r => ({ data: r.data.data, pagination: r.data.pagination }));
  },

  getById(id: string): Promise<GeneratedLetterResponse> {
    return api
      .get<{ success: boolean; data: GeneratedLetterResponse }>(`/letters/${id}`)
      .then(r => r.data.data);
  },

  approve(id: string, data: ApproveLetterInput): Promise<GeneratedLetterResponse> {
    return api
      .patch<{ success: boolean; data: GeneratedLetterResponse }>(`/letters/${id}/approve`, data)
      .then(r => r.data.data);
  },

  async downloadPdf(id: string, fileName?: string): Promise<void> {
    const resp = await api.get(`/letters/${id}/pdf`, { responseType: 'blob' });
    const blob = new Blob([resp.data as BlobPart], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = fileName ?? `letter-${id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
