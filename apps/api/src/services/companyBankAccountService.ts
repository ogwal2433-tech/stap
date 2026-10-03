import prisma from '../db/prisma';
import { writeAuditLog } from '../lib/auditLog';
import { AppError, NotFoundError } from '../errors/AppError';
import type {
  CompanyBankAccountResponse,
  CompanyBankAccountCreateInput,
  CompanyBankAccountUpdateInput,
} from '@security360/shared';

/**
 * The accounts this company is paid into.
 *
 * Grew out of the single set of company_bank_* SystemSetting rows: a company
 * usually holds several (a UGX current account, a USD one, a mobile-money
 * merchant). Exactly one is flagged default — the one printed wherever a
 * document names a single account — while every active one is listed on the
 * invoice so a client can choose.
 */

function fmt(a: any): CompanyBankAccountResponse {
  return {
    id:            a.id,
    label:         a.label,
    type:          a.type,
    currency:      a.currency ?? null,
    bankName:      a.bankName ?? null,
    branchName:    a.branchName ?? null,
    branchNo:      a.branchNo ?? null,
    accountName:   a.accountName ?? null,
    accountNumber: a.accountNumber ?? null,
    isDefault:     a.isDefault,
    isActive:      a.isActive,
    sortOrder:     a.sortOrder,
    createdAt:     a.createdAt.toISOString(),
    updatedAt:     a.updatedAt.toISOString(),
  };
}

// Default first, then the order an operator set, then name — the sequence the
// invoice and the settings list both want.
const ORDER = [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { label: 'asc' }] as const;

export const companyBankAccountService = {
  /** Every account, inactive included — the editor needs to see and revive them. */
  async list(): Promise<CompanyBankAccountResponse[]> {
    const rows = await prisma.companyBankAccount.findMany({ orderBy: ORDER as any });
    return rows.map(fmt);
  },

  /** The active accounts, default first — what a printed document reads. */
  async listActive(): Promise<CompanyBankAccountResponse[]> {
    const rows = await prisma.companyBankAccount.findMany({
      where: { isActive: true }, orderBy: ORDER as any,
    });
    return rows.map(fmt);
  },

  async create(data: CompanyBankAccountCreateInput, by: string): Promise<CompanyBankAccountResponse> {
    const created = await prisma.$transaction(async (tx) => {
      // First account added is the default whether or not the form said so: a
      // document that names one account needs a definite fallback.
      const isFirst = (await tx.companyBankAccount.count()) === 0;
      const makeDefault = isFirst || data.isDefault === true;
      if (makeDefault) await tx.companyBankAccount.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      return tx.companyBankAccount.create({
        data: {
          label:         data.label,
          type:          data.type,
          currency:      data.currency ?? null,
          bankName:      data.bankName ?? null,
          branchName:    data.branchName ?? null,
          branchNo:      data.branchNo ?? null,
          accountName:   data.accountName ?? null,
          accountNumber: data.accountNumber ?? null,
          isDefault:     makeDefault,
          isActive:      data.isActive ?? true,
          sortOrder:     data.sortOrder ?? 0,
          updatedBy:     by,
        },
      });
    });
    await writeAuditLog({ userId: by, action: 'COMPANY_BANK_ACCOUNT_CREATED', entity: 'CompanyBankAccount', entityId: created.id, newValue: fmt(created) });
    return fmt(created);
  },

  async update(id: string, data: CompanyBankAccountUpdateInput, by: string): Promise<CompanyBankAccountResponse> {
    const existing = await prisma.companyBankAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Payment account not found');

    const updated = await prisma.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.companyBankAccount.updateMany({ where: { isDefault: true, NOT: { id } }, data: { isDefault: false } });
      }
      // Refuse to clear the last default directly; the "Set as default" action
      // moves it, and deactivating a default hands it to the next active row.
      const willBeDefault = data.isDefault ?? existing.isDefault;
      const willBeActive  = data.isActive ?? existing.isActive;
      if (existing.isDefault && (willBeDefault === false || willBeActive === false)) {
        const others = await tx.companyBankAccount.count({ where: { isDefault: true, id: { not: id } } });
        if (others === 0) {
          throw new AppError('Another account must be the default first. Use "Set as default" on the account you want to promote.', 400);
        }
      }
      return tx.companyBankAccount.update({
        where: { id },
        data: {
          ...(data.label !== undefined         ? { label: data.label }             : {}),
          ...(data.type !== undefined           ? { type: data.type }               : {}),
          ...(data.currency !== undefined       ? { currency: data.currency ?? null } : {}),
          ...(data.bankName !== undefined       ? { bankName: data.bankName ?? null } : {}),
          ...(data.branchName !== undefined     ? { branchName: data.branchName ?? null } : {}),
          ...(data.branchNo !== undefined       ? { branchNo: data.branchNo ?? null } : {}),
          ...(data.accountName !== undefined    ? { accountName: data.accountName ?? null } : {}),
          ...(data.accountNumber !== undefined  ? { accountNumber: data.accountNumber ?? null } : {}),
          ...(data.isDefault !== undefined      ? { isDefault: data.isDefault }     : {}),
          ...(data.isActive !== undefined       ? { isActive: data.isActive }       : {}),
          ...(data.sortOrder !== undefined      ? { sortOrder: data.sortOrder }     : {}),
          updatedBy: by,
        },
      });
    });

    // Deactivating the only default would leave a document with no account to
    // name; hand the flag to the next active one so the invariant holds.
    if (existing.isDefault && !updated.isActive) {
      const next = await prisma.companyBankAccount.findFirst({ where: { isActive: true }, orderBy: ORDER as any });
      if (next) await prisma.companyBankAccount.update({ where: { id: next.id }, data: { isDefault: true } });
    }

    await writeAuditLog({
      userId: by, action: 'COMPANY_BANK_ACCOUNT_UPDATED', entity: 'CompanyBankAccount', entityId: id,
      oldValue: fmt(existing), newValue: fmt(updated),
    });
    return fmt(updated);
  },

  async setDefault(id: string, by: string): Promise<CompanyBankAccountResponse> {
    const existing = await prisma.companyBankAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Payment account not found');
    if (!existing.isActive) throw new AppError('Activate this account before making it the default.', 400);

    await prisma.$transaction([
      prisma.companyBankAccount.updateMany({ where: { isDefault: true, NOT: { id } }, data: { isDefault: false } }),
      prisma.companyBankAccount.update({ where: { id }, data: { isDefault: true, updatedBy: by } }),
    ]);
    const updated = await prisma.companyBankAccount.findUnique({ where: { id } });
    await writeAuditLog({
      userId: by, action: 'COMPANY_BANK_ACCOUNT_SET_DEFAULT', entity: 'CompanyBankAccount', entityId: id,
      oldValue: { isDefault: existing.isDefault }, newValue: { isDefault: true },
    });
    return fmt(updated!);
  },

  async remove(id: string, by: string): Promise<void> {
    const existing = await prisma.companyBankAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Payment account not found');
    await prisma.companyBankAccount.delete({ where: { id } });

    // Removing the default must not leave the company without one.
    if (existing.isDefault) {
      const next = await prisma.companyBankAccount.findFirst({ where: { isActive: true }, orderBy: ORDER as any });
      if (next) await prisma.companyBankAccount.update({ where: { id: next.id }, data: { isDefault: true } });
    }

    await writeAuditLog({
      userId: by, action: 'COMPANY_BANK_ACCOUNT_DELETED', entity: 'CompanyBankAccount', entityId: id,
      oldValue: fmt(existing),
    });
  },
};
