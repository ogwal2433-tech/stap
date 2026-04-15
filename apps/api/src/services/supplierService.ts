import prisma from '../db/prisma';
import { NotFoundError } from '../errors/AppError';
import type { CreateSupplierInput, SupplierResponse } from '@stap/shared';

function fmt(s: any): SupplierResponse {
  return {
    id:             s.id,
    name:           s.name,
    contactPerson:  s.contactPerson,
    phone:          s.phone,
    email:          s.email,
    address:        s.address,
    itemCategories: s.itemCategories,
    paymentTerms:   s.paymentTerms,
    createdAt:      s.createdAt.toISOString(),
  };
}

class SupplierService {
  async create(data: CreateSupplierInput): Promise<SupplierResponse> {
    const supplier = await prisma.supplier.create({
      data: {
        name:           data.name,
        contactPerson:  data.contactPerson ?? null,
        phone:          data.phone ?? null,
        email:          data.email ?? null,
        address:        data.address ?? null,
        itemCategories: data.itemCategories ?? [],
        paymentTerms:   data.paymentTerms ?? null,
      },
    });
    return fmt(supplier);
  }

  async update(id: string, data: Partial<CreateSupplierInput>): Promise<SupplierResponse> {
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundError('Supplier not found');

    const updated = await prisma.supplier.update({ where: { id }, data });
    return fmt(updated);
  }

  async list(): Promise<SupplierResponse[]> {
    const suppliers = await prisma.supplier.findMany({ orderBy: { name: 'asc' } });
    return suppliers.map(fmt);
  }

  async getById(id: string): Promise<SupplierResponse> {
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundError('Supplier not found');
    return fmt(supplier);
  }

  async delete(id: string): Promise<void> {
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundError('Supplier not found');
    await prisma.supplier.delete({ where: { id } });
  }
}

export const supplierService = new SupplierService();
