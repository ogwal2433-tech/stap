import api from './api';
import type {
  ComplaintResponse,
  ComplaintDashboard,
  CreateComplaintInput,
  CreateOutboundComplaintInput,
  AssignComplaintInput,
  UpdateComplaintStatusInput,
  PaginatedResponse,
} from '@security360/shared';

export const complaintsApi = {
  list(params?: {
    status?:    string;
    clientId?:  string;
    category?:  string;
    /** Omit for both directions. */
    direction?: 'INBOUND' | 'OUTBOUND' | 'ALL';
    page?:      number;
    limit?:     number;
  }): Promise<PaginatedResponse<ComplaintResponse>> {
    return api.get('/complaints', { params }).then((r) => r.data);
  },

  /** Send a formal notice from Security360 to a client. */
  sendNotice(data: CreateOutboundComplaintInput): Promise<ComplaintResponse> {
    return api.post('/complaints/outbound', data).then((r) => r.data.data);
  },

  /** Close an outbound notice once it has been dealt with. */
  resolveNotice(id: string): Promise<ComplaintResponse> {
    return api.patch(`/complaints/${id}/resolve-notice`).then((r) => r.data.data);
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
