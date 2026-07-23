import api from './api';
import type { InvoiceResponse, ComplaintResponse, CreateComplaintInput, ServiceRequestResponse, CreateServiceRequestInput, PaginatedResponse } from '@stap/shared';

export interface PortalOverview {
  client:              { id: string; clientName: string; email?: string; contactPhone: string };
  outstandingInvoices: number;
  openComplaints:      number;
  deployedToday:       number;
}

export interface DeployedGuard {
  guardName:  string;
  site:       string;
  shiftType:  string;
  supervisor: string;
  date:       string;
}

export const portalApi = {
  getOverview(): Promise<PortalOverview> {
    return api.get('/portal/overview').then(r => r.data.data);
  },

  getInvoices(): Promise<PaginatedResponse<InvoiceResponse>> {
    return api.get('/portal/invoices').then(r => r.data);
  },

  getInvoice(id: string): Promise<InvoiceResponse> {
    return api.get(`/portal/invoices/${id}`).then(r => r.data.data);
  },

  payInvoice(id: string): Promise<{ paymentRef: string; status: string }> {
    return api.get(`/portal/invoices/${id}/pay`).then(r => r.data.data);
  },

  getDeployedGuards(): Promise<DeployedGuard[]> {
    return api.get('/portal/guards').then(r => r.data.data);
  },

  getSites(): Promise<{ id: string; siteName: string }[]> {
    return api.get('/portal/sites').then(r => r.data.data);
  },

  submitComplaint(data: Omit<CreateComplaintInput, 'clientId'>): Promise<ComplaintResponse> {
    return api.post('/portal/complaints', data).then(r => r.data.data);
  },

  getComplaints(): Promise<PaginatedResponse<ComplaintResponse>> {
    return api.get('/portal/complaints').then(r => r.data);
  },

  getServiceRequests(): Promise<PaginatedResponse<ServiceRequestResponse>> {
    return api.get('/portal/service-requests').then(r => r.data);
  },

  submitServiceRequest(data: Omit<CreateServiceRequestInput, 'clientId'>): Promise<ServiceRequestResponse> {
    return api.post('/portal/service-requests', data).then(r => r.data.data);
  },
};
