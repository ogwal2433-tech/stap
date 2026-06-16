import api from './api';
import type {
  ComplaintResponse,
  ComplaintDashboard,
  CreateComplaintInput,
  AssignComplaintInput,
  UpdateComplaintStatusInput,
  PaginatedResponse,
} from '@stap/shared';

export const complaintsApi = {
  list(params?: {
    status?:   string;
    clientId?: string;
    category?: string;
    page?:     number;
    limit?:    number;
  }): Promise<PaginatedResponse<ComplaintResponse>> {
    return api.get('/complaints', { params }).then((r) => r.data);
  },

  getById(id: string): Promise<ComplaintResponse> {
    return api.get(`/complaints/${id}`).then((r) => r.data.data);
  },

  create(data: CreateComplaintInput): Promise<ComplaintResponse> {
    return api.post('/complaints', data).then((r) => r.data.data);
  },

  assign(id: string, data: AssignComplaintInput): Promise<ComplaintResponse> {
    return api.patch(`/complaints/${id}/assign`, data).then((r) => r.data.data);
  },

  updateStatus(id: string, data: UpdateComplaintStatusInput): Promise<ComplaintResponse> {
    return api.patch(`/complaints/${id}/status`, data).then((r) => r.data.data);
  },

  getDashboard(): Promise<ComplaintDashboard> {
    return api.get('/complaints/dashboard').then((r) => r.data.data);
  },
};
