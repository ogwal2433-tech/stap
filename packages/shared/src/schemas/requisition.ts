import { z } from 'zod';

// ── Category constants ─────────────────────────────────────────────────────────

export const REQUISITION_CATEGORY_LIST = [
  'Stationery', 'Equipment', 'Fuel', 'Maintenance',
  'Uniform', 'Training', 'Medical', 'Transport', 'Other',
] as const;

// ── Input schemas ──────────────────────────────────────────────────────────────

export const CategoryItemSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  unit:     z.string().max(50).optional(),
});

export const CreateRequisitionSchema = z.object({
  date:           z.string().optional(),
  particulars:    z.string().min(3, 'Particulars must be at least 3 characters'),
  amount:         z.number().int().positive('Amount must be positive'),
  categoryItems:  z.array(CategoryItemSchema).min(1, 'Select at least one category and specify a quantity'),
  remarks:        z.string().optional(),
  accountDetails: z.string().optional(),
  accountName:    z.string().optional(),
  bankName:       z.string().optional(),
}).refine(
  (data) => {
    const cats = data.categoryItems.map((c) => c.category);
    return new Set(cats).size === cats.length;
  },
  {
    message: 'Each category can only be added once. Adjust the quantity instead of adding it twice.',
    path: ['categoryItems'],
  },
);

export const HRApproveRequisitionSchema = z.object({});

export const DirectorApproveRequisitionSchema = z.object({});

export const AssignRequisitionSchema = z.object({
  assignedToId: z.string().min(1, 'Assignee is required'),
});

export const UpdateProgressSchema = z.object({
  progress: z.string().min(1, 'Progress note is required'),
});

export const RejectRequisitionSchema = z.object({
  rejectionReason: z.string().min(10, 'Please provide a reason (min 10 chars)'),
  comments:        z.string().optional(),
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
  // Supplied via the :id URL param on POST /requisitions/:id/purchase-order,
  // not the request body — optional here so body validation doesn't reject
  // requests before the route handler merges it in from req.params.
  requisitionId:    z.string().min(1).optional(),
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

export type CategoryItemInput              = z.infer<typeof CategoryItemSchema>;
export type CreateRequisitionInput         = z.infer<typeof CreateRequisitionSchema>;
export type HRApproveRequisitionInput      = z.infer<typeof HRApproveRequisitionSchema>;
export type DirectorApproveRequisitionInput = z.infer<typeof DirectorApproveRequisitionSchema>;
export type AssignRequisitionInput         = z.infer<typeof AssignRequisitionSchema>;
export type UpdateProgressInput            = z.infer<typeof UpdateProgressSchema>;
export type RejectRequisitionInput         = z.infer<typeof RejectRequisitionSchema>;
export type ApproveRequisitionInput        = z.infer<typeof ApproveRequisitionSchema>;
export type CreatePurchaseOrderInput       = z.infer<typeof CreatePurchaseOrderSchema>;
export type CreateSupplierInput            = z.infer<typeof CreateSupplierSchema>;

// ── Response interfaces ────────────────────────────────────────────────────────

export interface CategoryItemResponse {
  id:       string;
  category: string;
  quantity: number;
  unit:     string | null;
}

export interface RequisitionResponse {
  id:               string;
  date:             string;
  particulars:      string;
  amount:           number;
  categoryItems:    CategoryItemResponse[];
  requestedBy:      { id: string; name: string };
  hrApproved:       { by: { id: string; name: string } | null; at: string | null };
  directorApproved: { by: { id: string; name: string } | null; at: string | null };
  assignedTo:       { id: string; name: string; role: string } | null;
  progress:         string | null;
  remarks:          string | null;
  accountDetails:   string | null;
  accountName:      string | null;
  bankName:         string | null;
  status:           string;
  rejectedBy:       string | null;
  rejectedAt:       string | null;
  rejectionReason:  string | null;
  purchaseOrders:   PurchaseOrderResponse[];
  createdAt:        string;
  updatedAt:        string;
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
