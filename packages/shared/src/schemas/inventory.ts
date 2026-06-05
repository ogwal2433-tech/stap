import { z } from 'zod';

// ── Condition constants ────────────────────────────────────────────────────────

export const ITEM_CONDITIONS = {
  NEW:     'New',
  GOOD:    'Good',
  FAIR:    'Fair',
  DAMAGED: 'Damaged',
} as const;

export type ItemCondition = keyof typeof ITEM_CONDITIONS;

export const ITEM_CONDITION_COLORS: Record<ItemCondition, string> = {
  NEW:     '#1E8449',
  GOOD:    '#084298',
  FAIR:    '#664d03',
  DAMAGED: '#842029',
};

export const ITEM_CONDITION_BG: Record<ItemCondition, string> = {
  NEW:     '#d5f5e3',
  GOOD:    '#cfe2ff',
  FAIR:    '#fff3cd',
  DAMAGED: '#f8d7da',
};

// ── Item schemas ───────────────────────────────────────────────────────────────

export const CreateInventoryItemSchema = z.object({
  itemName:         z.string().min(1).max(200),
  itemType:         z.enum(['UNIFORM', 'EQUIPMENT', 'CONSUMABLE']),
  unitCost:         z.number().int().positive(),
  stockQuantity:    z.number().int().min(0).default(0),
  reorderThreshold: z.number().int().min(0).default(5),
  description:      z.string().optional(),
});
export type CreateInventoryItemInput = z.infer<typeof CreateInventoryItemSchema>;

export const UpdateInventoryItemSchema = CreateInventoryItemSchema.partial();
export type UpdateInventoryItemInput = z.infer<typeof UpdateInventoryItemSchema>;

// ── Transaction schemas ────────────────────────────────────────────────────────

export const IssueItemSchema = z.object({
  itemId:             z.string().min(1),
  guardId:            z.string().min(1),
  quantity:           z.number().int().min(1),
  conditionNote:      z.string()
    .min(3, "Condition note is required — describe the item's condition before issuing (e.g. 'New', 'Good condition', 'Minor wear').")
    .max(500, 'Condition note cannot exceed 500 characters.'),
  issueFromCondition: z.enum(['NEW', 'GOOD', 'FAIR', 'DAMAGED']).optional(),
});
export type IssueItemInput = z.infer<typeof IssueItemSchema>;

export const IssueLineItemSchema = z.object({
  itemId:        z.string().min(1),
  quantity:      z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  itemCondition: z.enum(['NEW', 'GOOD', 'FAIR', 'DAMAGED']).default('GOOD'),
  conditionNote: z.string()
    .min(3, 'Condition note is required.')
    .max(500)
    .transform(s => s.trim()),
});
export type IssueLineItemInput = z.infer<typeof IssueLineItemSchema>;

export const BatchIssueSchema = z.object({
  guardId: z.string().min(1, 'Please select a guard'),
  items:   z.array(IssueLineItemSchema).min(1, 'Add at least one item to issue'),
});
export type BatchIssueInput = z.infer<typeof BatchIssueSchema>;

export interface BatchIssueResult {
  guardId:     string;
  guardName:   string;
  issued: {
    itemId:        string;
    itemName:      string;
    quantity:      number;
    itemCondition: string;
    conditionNote: string;
    transactionId: string;
  }[];
  failedItems: string[];
  totalIssued: number;
}

export const ReturnItemSchema = z.object({
  itemId:            z.string().min(1),
  guardId:           z.string().min(1),
  quantity:          z.number().int().min(1),
  action:            z.enum(['RETURNED', 'LOST', 'DAMAGED']),
  conditionNote:     z.string().optional(),
  returnedCondition: z.enum(['NEW', 'GOOD', 'FAIR', 'DAMAGED']).optional(),
});
export type ReturnItemInput = z.infer<typeof ReturnItemSchema>;

export const StockAdjustmentSchema = z.object({
  itemId:    z.string().min(1),
  quantity:  z.number().int(),
  reference: z.string().optional(),
  note:      z.string().optional(),
  condition: z.enum(['NEW', 'GOOD', 'FAIR', 'DAMAGED']).optional(),
});
export type StockAdjustmentInput = z.infer<typeof StockAdjustmentSchema>;

export const AdjustConditionSchema = z.object({
  quantityNew:     z.coerce.number().int().min(0),
  quantityGood:    z.coerce.number().int().min(0),
  quantityFair:    z.coerce.number().int().min(0),
  quantityDamaged: z.coerce.number().int().min(0),
  notes:           z.string().max(500).optional(),
});
export type AdjustConditionInput = z.infer<typeof AdjustConditionSchema>;

// ── Response Interfaces ────────────────────────────────────────────────────────

export interface StockConditionBreakdown {
  NEW:     number;
  GOOD:    number;
  FAIR:    number;
  DAMAGED: number;
}

export interface InventoryItemResponse {
  id:                 string;
  itemCode:           string;
  itemName:           string;
  itemType:           string;
  unitCost:           number;
  stockQuantity:      number;
  conditionBreakdown: StockConditionBreakdown;
  reorderThreshold:   number;
  description:        string | null;
  isLowStock:         boolean;
  isActive:           boolean;
  issuedFree:         boolean;
  isShoeItem:         boolean;
  issuedCount:        number;
  createdAt:          string;
}

export interface InventoryTransactionResponse {
  id:            string;
  item:          { id: string; itemName: string; itemCode: string };
  guard:         { id: string; fullName: string } | null;
  action:        string;
  quantity:      number;
  conditionNote: string;
  chargedAmount: number | null;
  reference:     string | null;
  recordedBy:    { id: string; name: string };
  createdAt:     string;
}

export interface GuardInventoryItem {
  item:        { id: string; itemName: string; itemCode: string; itemType: string };
  issued:      number;
  returned:    number;
  outstanding: number;
}

export interface SystemSettingResponse {
  id:       string;
  key:      string;
  value:    string;
  label:    string;
  group:    string;
  dataType: string;
}

export interface UserResponse {
  id:        string;
  systemId:  string | null;
  name:      string;
  email:     string;
  role:      string;
  status:    string;
  createdAt: string;
}
