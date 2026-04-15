import { z } from 'zod';

// ── Input schemas ──────────────────────────────────────────────────────────────

export const CreateRequisitionSchema = z.object({
  category:          z.enum(['UNIFORM', 'EQUIPMENT', 'STATIONERY', 'VEHICLE_MAINTENANCE', 'OTHER']),
  description:       z.string().min(10),
  quantity:          z.number().int().min(1),
  estimatedUnitCost: z.number().int().positive(),
  urgency:           z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  justification:     z.string().optional(),
});

export const ApproveRequisitionSchema = z.object({
  action:          z.enum(['APPROVE', 'REJECT']),
  rejectionReason: z.string().min(10).optional(),
  comments:        z.string().optional(),
}).refine(
  (data) => data.action === 'APPROVE' || (data.action === 'REJECT' && !!data.rejectionReason),
  { message: 'Rejection reason required when rejecting' },
);

export const CreatePurchaseOrderSchema = z.object({
  requisitionId:    z.string().min(1),
  supplierId:       z.string().min(1).optional(),
  quantity:         z.number().int().min(1),
  unitCost:         z.number().int().positive(),
  expectedDelivery: z.string().datetime().optional(),
});

export const CreateSupplierSchema = z.object({
  name:           z.string().min(1).max(200),
  contactPerson:  z.string().max(100).optional(),
  phone:          z.string().regex(/^\+?[0-9]{10,15}$/).optional(),
  email:          z.string().email().optional(),
  address:        z.string().max(500).optional(),
  itemCategories: z.array(z.string()).optional(),
  paymentTerms:   z.string().max(200).optional(),
});

// ── Inferred input types ───────────────────────────────────────────────────────

export type CreateRequisitionInput    = z.infer<typeof CreateRequisitionSchema>;
export type ApproveRequisitionInput   = z.infer<typeof ApproveRequisitionSchema>;
export type CreatePurchaseOrderInput  = z.infer<typeof CreatePurchaseOrderSchema>;
export type CreateSupplierInput       = z.infer<typeof CreateSupplierSchema>;

// ── Response interfaces ────────────────────────────────────────────────────────

export interface RequisitionResponse {
  id:                string;
  raisedBy:          string;
  raisedByName:      string;
  category:          string;
  description:       string;
  quantity:          number;
  estimatedUnitCost: number;
  estimatedTotal:    number;
  urgency:           string;
  justification:     string | null;
  status:            string;
  approvedBy:        string | null;
  approvedByName:    string | null;
  approvedAt:        string | null;
  rejectedBy:        string | null;
  rejectedAt:        string | null;
  rejectionReason:   string | null;
  comments:          string | null;
  createdAt:         string;
  purchaseOrders:    PurchaseOrderResponse[];
}

export interface PurchaseOrderResponse {
  id:               string;
  requisitionId:    string;
  supplierId:       string | null;
  supplierName:     string | null;
  quantity:         number;
  unitCost:         number;
  totalCost:        number;
  expectedDelivery: string | null;
  status:           string;
  pdfPath:          string | null;
  createdBy:        string;
  createdAt:        string;
}

export interface SupplierResponse {
  id:             string;
  name:           string;
  contactPerson:  string | null;
  phone:          string | null;
  email:          string | null;
  address:        string | null;
  itemCategories: string[];
  paymentTerms:   string | null;
  createdAt:      string;
}
