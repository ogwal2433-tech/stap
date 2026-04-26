import { z } from 'zod';

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
  itemId:       z.string().cuid(),
  guardId:      z.string().cuid(),
  quantity:     z.number().int().min(1),
  conditionNote: z.string().optional(),
});
export type IssueItemInput = z.infer<typeof IssueItemSchema>;

export const ReturnItemSchema = z.object({
  itemId:        z.string().cuid(),
  guardId:       z.string().cuid(),
  quantity:      z.number().int().min(1),
  action:        z.enum(['RETURNED', 'LOST', 'DAMAGED']),
  conditionNote: z.string().optional(),
});
export type ReturnItemInput = z.infer<typeof ReturnItemSchema>;

export const StockAdjustmentSchema = z.object({
  itemId:    z.string().cuid(),
  quantity:  z.number().int(),
  reference: z.string().optional(),
  note:      z.string().optional(),
});
export type StockAdjustmentInput = z.infer<typeof StockAdjustmentSchema>;

// ── Response Interfaces ────────────────────────────────────────────────────────

export interface InventoryItemResponse {
  id:               string;
  itemCode:         string;
  itemName:         string;
  itemType:         string;
  unitCost:         number;
  stockQuantity:    number;
  reorderThreshold: number;
  description:      string | null;
  isLowStock:       boolean;
  isActive:         boolean;
  issuedFree:       boolean;
  isShoeItem:       boolean;
  issuedCount:      number;
  createdAt:        string;
}

export interface InventoryTransactionResponse {
  id:            string;
  item:          { id: string; itemName: string; itemCode: string };
  guard:         { id: string; fullName: string } | null;
  action:        string;
  quantity:      number;
  conditionNote: string | null;
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
  name:      string;
  email:     string;
  role:      string;
  status:    string;
  createdAt: string;
}
