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

export const UpdateRequisitionSchema = z.object({
  date:           z.string().datetime().optional(),
  particulars:    z.string().min(3, 'Particulars must be at least 3 characters').max(1000).optional(),
  amount:         z.coerce.number().int().positive('Amount must be positive').optional(),
  categoryItems:  z.array(CategoryItemSchema).min(1, 'Select at least one category and specify a quantity').optional(),
  remarks:        z.string().max(1000).optional().nullable(),
  accountDetails: z.string().max(200).optional().nullable(),
  accountName:    z.string().max(200).optional().nullable(),
  bankName:       z.string().max(200).optional().nullable(),
}).refine(
  (data) => {
    if (!data.categoryItems) return true;
    const cats = data.categoryItems.map((c) => c.category);
    return new Set(cats).size === cats.length;
  },
  {
    message: 'Each category can only be added once. Adjust the quantity instead of adding it twice.',
    path: ['categoryItems'],
  },
);

/**
 * Statuses at which a requisition is still the requester's to change.
 *
 * Necessary but not sufficient — see {@link canEditRequisition}. HR approval
 * does not move the status, so this list alone would leave an HR-approved
 * requisition editable.
 */
export const EDITABLE_STATUSES = ['PENDING', 'SUBMITTED'] as const;

/**
 * Whether a requisition can still be edited.
 *
 * Locks on HR sign-off rather than on status alone: `hrApprove` records
 * `hrApprovedAt` and deliberately leaves `status` at PENDING, so checking the
 * status by itself would let a requester rewrite a requisition HR had already
 * approved.
 *
 * @param hrApprovedAt When HR approved, or null/undefined if they have not.
 */
export function canEditRequisition(
  status: string,
  hrApprovedAt?: string | Date | null,
): boolean {
  if (hrApprovedAt) return false;
  return (EDITABLE_STATUSES as readonly string[]).includes(status);
}

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

// ── List query ─────────────────────────────────────────────────────────────────

const requisitionDateFilter = z.string().refine(
  (v) => !isNaN(Date.parse(v)),
  { message: 'Invalid date' },
);

/** A range the wrong way round is a slip, not an empty answer — refuse it. */
const fromNotAfterTo = (q: { from?: string; to?: string }) =>
  !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to);

const RANGE_MESSAGE = 'The from date must be on or before the to date';

/**
 * The narrowing both the requisition list and its PDF export accept, declared
 * once so a printed page and the table on screen answer the same question. Dates
 * bound the requisition's own `date` (the column shown in the table), not
 * `createdAt`; `requestedById` is honoured only for admin roles, since the
 * service always scopes everyone else to their own submissions.
 */
const requisitionFilterBase = z.object({
  status:        z.string().optional(),
  requestedById: z.string().min(1).optional(),
  from:          requisitionDateFilter.optional(),
  to:            requisitionDateFilter.optional(),
});

/** Query for GET /requisitions, shared by the My Requisitions and Manage tabs. */
export const RequisitionListQuerySchema = requisitionFilterBase
  .extend({
    page:  z.coerce.number().int().positive().default(1),
    // The requisition table has no pager, so the whole filtered set is expected
    // in one call; 500 bounds a stray query without dragging the table across.
    limit: z.coerce.number().int().min(1).max(500).default(20),
  })
  .refine(fromNotAfterTo, { message: RANGE_MESSAGE, path: ['from'] });

/**
 * Query for GET /requisitions/export/pdf: the same narrowing as the list with no
 * paging, because an export prints every row under the filters, not one page.
 */
export const RequisitionExportQuerySchema = requisitionFilterBase.refine(
  fromNotAfterTo,
  { message: RANGE_MESSAGE, path: ['from'] },
);

export type RequisitionListQuery   = z.infer<typeof RequisitionListQuerySchema>;
export type RequisitionExportQuery = z.infer<typeof RequisitionExportQuerySchema>;


// ── Inferred input types ───────────────────────────────────────────────────────

export type CategoryItemInput              = z.infer<typeof CategoryItemSchema>;
export type CreateRequisitionInput         = z.infer<typeof CreateRequisitionSchema>;
export type UpdateRequisitionInput         = z.infer<typeof UpdateRequisitionSchema>;
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
  /** Sum of every dispatch raised against this requisition, in UGX. */
  totalDispatched:  number;
  dispatchStatus:   DispatchStatus;
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

// ── Fund dispatch ──────────────────────────────────────────────────────────────

/** Channels approved funds can be sent through. */
export const DISPATCH_CHANNELS = [
  { value: 'E_TRANSACT',    label: '💳 E-Transact' },
  { value: 'CASH',          label: '💵 Cash' },
  { value: 'BANK_TRANSFER', label: '🏦 Bank Transfer' },
  { value: 'MOBILE_MONEY',  label: '📱 Mobile Money' },
  { value: 'CHEQUE',        label: '📝 Cheque' },
  { value: 'OTHER',         label: '📋 Other' },
] as const;

export type DispatchChannel = (typeof DISPATCH_CHANNELS)[number]['value'];

/** Channels that leave a paper trail we insist on capturing. */
export const REFERENCED_CHANNELS: readonly DispatchChannel[] = [
  'E_TRANSACT', 'BANK_TRANSFER', 'CHEQUE',
] as const;

export const DISPATCH_STATUSES = ['PENDING', 'PARTIAL', 'FULLY_DISPATCHED'] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

export function dispatchChannelLabel(channel: string): string {
  return DISPATCH_CHANNELS.find((c) => c.value === channel)?.label ?? channel;
}

export const CreateFundDispatchSchema = z.object({
  channel:          z.enum(['E_TRANSACT', 'CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'OTHER']),
  amount:           z.coerce.number().int().min(1, 'Amount must be at least 1 UGX'),
  reference:        z.string().max(200).optional().nullable(),
  recipientName:    z.string().max(200).optional().nullable(),
  recipientAccount: z.string().max(200).optional().nullable(),
  dispatchDate:     z.string().datetime().optional(),
  notes:            z.string().max(1000).optional().nullable(),
}).refine(
  (data) => !REFERENCED_CHANNELS.includes(data.channel) || !!data.reference?.trim(),
  {
    message: 'A reference number is required for E-Transact, Bank Transfer, and Cheque payments.',
    path: ['reference'],
  },
);

export type CreateFundDispatchInput = z.infer<typeof CreateFundDispatchSchema>;

export interface FundDispatchResponse {
  id:               string;
  requisitionId:    string;
  channel:          DispatchChannel;
  amount:           number;
  reference:        string | null;
  recipientName:    string | null;
  recipientAccount: string | null;
  dispatchDate:     string;
  notes:            string | null;
  dispatchedBy:     { id: string; name: string };
  createdAt:        string;
}

// ── Accountability ─────────────────────────────────────────────────────────────

/**
 * Statuses a submitted accountability moves through, in order. Each reviewer
 * records their own figure per line so a disagreement stays visible rather than
 * being overwritten by the next person.
 */
export const ACCOUNTABILITY_STAGES = [
  'SUBMITTED',
  'ADMIN_REVIEWED',
  'HR_REVIEWED',
  'DIRECTOR_APPROVED',
] as const;

export type AccountabilityStatus = (typeof ACCOUNTABILITY_STAGES)[number];

export const AccountabilityItemSchema = z.object({
  requisitionItem: z.string().min(1, 'Describe what was bought').max(300),
  category:        z.string().min(1, 'Category is required').max(100),
  quantity:        z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  rate:            z.coerce.number().int().min(0, 'Rate cannot be negative'),
  notes:           z.string().max(500).optional().nullable(),
});

export const CreateAccountabilitySchema = z.object({
  items: z.array(AccountabilityItemSchema).min(1, 'Add at least one line').max(100),
});

/** One reviewer's figures. Every line must be given an amount. */
export const ReviewAccountabilitySchema = z.object({
  items: z.array(z.object({
    id:     z.string().min(1),
    amount: z.coerce.number().int().min(0, 'Amount cannot be negative'),
    notes:  z.string().max(500).optional().nullable(),
  })).min(1, 'Enter an amount for each line'),
  notes: z.string().max(1000).optional().nullable(),
});

export type AccountabilityItemInput   = z.infer<typeof AccountabilityItemSchema>;
export type CreateAccountabilityInput = z.infer<typeof CreateAccountabilitySchema>;
export type ReviewAccountabilityInput = z.infer<typeof ReviewAccountabilitySchema>;

export interface AccountabilityItemResponse {
  id:              string;
  itemNumber:      number;
  requisitionItem: string;
  category:        string;
  quantity:        number;
  rate:            number;
  /** quantity × rate as submitted. */
  totalCost:       number;
  adminAmount:     number | null;
  hrAmount:        number | null;
  directorAmount:  number | null;
  notes:           string | null;
}

export interface AccountabilityResponse {
  id:                  string;
  requisitionId:       string;
  status:              AccountabilityStatus;
  totalSubmitted:      number;
  totalAdminAmount:    number;
  totalHRAmount:       number;
  totalDirectorAmount: number;
  originalAmount:      number;
  /** totalDirectorAmount − originalAmount. Positive = overspend. */
  variance:            number;
  submittedBy:         { id: string; name: string } | null;
  submittedAt:         string | null;
  adminReviewedBy:     { id: string; name: string } | null;
  adminReviewedAt:     string | null;
  adminNotes:          string | null;
  hrReviewedBy:        { id: string; name: string } | null;
  hrReviewedAt:        string | null;
  hrNotes:             string | null;
  directorApprovedBy:  { id: string; name: string } | null;
  directorApprovedAt:  string | null;
  directorNotes:       string | null;
  items:               AccountabilityItemResponse[];
  createdAt:           string;
  updatedAt:           string;
}
