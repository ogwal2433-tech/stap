import bcrypt from 'bcryptjs';
import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError } from '../errors/AppError';
import { generateClientId, generateStaffId } from '../lib/systemId';
import { AppError } from '../errors/AppError';
import type {
  ClientContactInput,
  ClientContactResponse,
  CreateClientInput,
  UpdateClientInput,
  ClientListQuery,
  ClientResponse,
  ClientSummary,
  PaginatedResponse,
} from '@stap/shared';

/** How contacts are always ordered: the primary first, then oldest first. */
const CONTACT_ORDER = [
  { isPrimary: 'desc' as const },
  { createdAt: 'asc'  as const },
];

/** A blank input submits '', which is a value, not an absence. Store the absence. */
const blankToNull = (v: string | null | undefined): string | null =>
  (typeof v === 'string' && v.trim() === '' ? null : v ?? null);

function toContactResponse(c: Record<string, unknown>): ClientContactResponse {
  return {
    id:          c.id as string,
    clientId:    c.clientId as string,
    contactType: c.contactType as ClientContactResponse['contactType'],
    name:        c.name as string,
    phone:       (c.phone as string | null) ?? null,
    email:       (c.email as string | null) ?? null,
    jobTitle:    (c.jobTitle as string | null) ?? null,
    isPrimary:   (c.isPrimary as boolean) ?? false,
    notes:       (c.notes as string | null) ?? null,
    createdAt:   (c.createdAt as Date).toISOString(),
    updatedAt:   (c.updatedAt as Date).toISOString(),
  };
}

/**
 * Exactly one contact carries the primary flag.
 *
 * Whoever is explicitly marked wins; failing that the first one does, because a
 * client with contacts but no primary would show "No contact added" in the list
 * while plainly having contacts.
 */
function withOnePrimary(contacts: ClientContactInput[]) {
  const marked = contacts.findIndex((c) => c.isPrimary);
  const primary = marked === -1 ? 0 : marked;
  return contacts.map((c, i) => {
    const isPrimary = i === primary;
    const asked = c.contactType ?? (isPrimary ? 'PRIMARY' : 'SECONDARY');
    return {
      // Only one row may be typed PRIMARY, and it is the one wearing the flag.
      contactType: (isPrimary ? asked : asked === 'PRIMARY' ? 'SECONDARY' : asked) as string,
      name:        c.name.trim(),
      phone:       blankToNull(c.phone),
      email:       blankToNull(c.email),
      jobTitle:    blankToNull(c.jobTitle),
      isPrimary,
      notes:       blankToNull(c.notes),
    };
  });
}

function toClientResponse(client: Record<string, unknown>): ClientResponse {
  return {
    id:              client.id as string,
    systemId:        (client.systemId as string | null) ?? null,
    clientName:      client.clientName as string,
    contactPerson:   client.contactPerson as string,
    contactPhone:    client.contactPhone as string,
    email:           (client.email as string | null) ?? null,
    physicalAddress: client.physicalAddress as string,
    billingAddress:  (client.billingAddress as string | null) ?? null,
    billingTerms:    client.billingTerms as number,
    contractStatus:  client.contractStatus as 'ACTIVE' | 'INACTIVE' | 'EXPIRED',

    tin:          (client.tin as string | null) ?? null,
    vatRegistered: (client.vatRegistered as boolean) ?? false,
    vatRate:       (client.vatRate as number | null) ?? null,

    leadSource:  (client.leadSource as ClientResponse['leadSource']) ?? null,
    referredBy:  (client.referredBy as string | null) ?? null,
    leadStatus:  (client.leadStatus as ClientResponse['leadStatus']) ?? 'CONVERTED',

    contacts: ((client.contacts as Record<string, unknown>[] | undefined) ?? [])
      .map(toContactResponse),

    createdAt: (client.createdAt as Date).toISOString(),
    updatedAt: (client.updatedAt as Date).toISOString(),
    ...(client._count ? { _count: client._count as ClientResponse['_count'] } : {}),
  };
}

class ClientService {
  // ── List ───────────────────────────────────────────────────────────────────

  async list(query: ClientListQuery): Promise<PaginatedResponse<ClientResponse>> {
    const { page, limit, search, contractStatus, leadStatus, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: import('@prisma/client').Prisma.ClientWhereInput = {};

    if (contractStatus) where.contractStatus = contractStatus;
    if (leadStatus)     where.leadStatus     = leadStatus;

    if (search) {
      where.OR = [
        { clientName:    { contains: search, mode: 'insensitive' } },
        { contactPerson: { contains: search, mode: 'insensitive' } },
        { email:         { contains: search, mode: 'insensitive' } },
        { systemId:      { contains: search, mode: 'insensitive' } },
      ];
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          contacts: { orderBy: CONTACT_ORDER },
          _count: { select: { sites: true, contracts: true, complaints: true } },
        },
      }),
      prisma.client.count({ where }),
    ]);

    return {
      data: clients.map((c) =>
        toClientResponse({
          ...c,
          _count: {
            sites: c._count.sites,
            contracts: c._count.contracts,
            clientComplaints: c._count.complaints,
          },
        }),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + limit < total,
        hasPrev: page > 1,
      },
    };
  }

  // ── Get by ID ──────────────────────────────────────────────────────────────

  async getById(id: string): Promise<ClientResponse> {
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        sites: { orderBy: { siteName: 'asc' } },
        contracts: { orderBy: { createdAt: 'desc' }, take: 3 },
        complaints: {
          where: { status: 'OPEN' },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        contacts: { orderBy: CONTACT_ORDER },
        _count: { select: { sites: true, contracts: true, complaints: true } },
      },
    });

    if (!client) throw new NotFoundError(`Client ${id} not found`);

    return {
      ...toClientResponse({
        ...client,
        _count: {
          sites: client._count.sites,
          contracts: client._count.contracts,
          clientComplaints: client._count.complaints,
        },
      }),
      // Pass through nested relations for detail view
      ...(client as unknown as Record<string, unknown>),
    } as ClientResponse;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(data: CreateClientInput, createdBy: string): Promise<ClientResponse> {
    const systemId = await generateClientId();

    // Checked before anything is written. A portal email already in use is the
    // one failure a caller actually hits, and finding out after the client row
    // exists would leave them with a half-made client and an error message.
    const portal = data.portal;
    if (portal) {
      const taken = await prisma.user.findUnique({
        where:  { email: portal.email },
        select: { id: true },
      });
      if (taken) throw new AppError(`${portal.email} is already used by another account`, 409);
    }

    // Either route may supply the contacts: the form sends contacts[], while an
    // older API caller (and prospect conversion) sends the flat pair. Whichever
    // arrives, both the relation and the denormalised columns get filled, so a
    // client is never left with contacts the invoice code cannot see, or a
    // contactPerson with no row behind it.
    const supplied = (data.contacts ?? []).filter((c) => c.name?.trim());
    const contacts = withOnePrimary(
      supplied.length > 0
        ? supplied
        : [{ contactType: 'PRIMARY', name: data.contactPerson!, phone: data.contactPhone, isPrimary: true }],
    );
    const primary = contacts.find((c) => c.isPrimary)!;

    const portalHash = portal ? await bcrypt.hash(portal.password, 12) : null;
    const portalSystemId = portal ? await generateStaffId() : null;

    // One transaction: a client whose portal login failed to save would show
    // "portal enabled" in the form the user just submitted and nothing behind it.
    const client = await prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
      data: {
        systemId,
        clientName:     data.clientName,
        contactPerson:  data.contactPerson?.trim() || primary.name,
        contactPhone:   data.contactPhone?.trim() || primary.phone || '',
        email:          blankToNull(data.email),
        physicalAddress: data.physicalAddress,
        // '' is what a blank input submits; these columns are nullable and mean
        // "not provided", so an empty string would be a value standing in for
        // an absence — and reads back as one.
        billingAddress: blankToNull(data.billingAddress),
        billingTerms:   data.billingTerms,
        contractStatus: data.contractStatus,
        tin:            blankToNull(data.tin),
        vatRegistered:  data.vatRegistered ?? false,
        vatRate:        data.vatRate ?? null,
        leadSource:     blankToNull(data.leadSource),
        referredBy:     blankToNull(data.referredBy),
        leadStatus:     data.leadStatus ?? 'CONVERTED',
        contacts:       { create: contacts },
      },
      include: {
        contacts: { orderBy: CONTACT_ORDER },
        _count: { select: { sites: true, contracts: true, complaints: true } },
      },
      });

      if (portal) {
        await tx.user.create({
          data: {
            systemId:     portalSystemId!,
            name:         portal.contactName,
            email:        portal.email,
            passwordHash: portalHash!,
            role:         'CLIENT',
            status:       'ACTIVE',
            clientId:     created.id,
          },
        });
      }

      return created;
    });

    await QueueService.logAudit({
      userId: createdBy,
      action: 'CLIENT_CREATED',
      entity: 'client',
      entityId: client.id,
      newValue: { clientName: client.clientName, portalEnabled: !!portal },
    });

    if (portal) {
      // Best effort — the account works whether or not the mail goes out.
      try {
        await QueueService.sendEmail({
          to:       portal.email,
          subject:  'Your client portal login',
          template: 'welcome',
          data:     { name: portal.contactName, email: portal.email, password: portal.password },
        });
      } catch (err) {
        console.error('⚠️  Failed to queue portal credentials for', portal.email, err);
      }
    }

    return toClientResponse({
      ...client,
      _count: {
        sites: client._count.sites,
        contracts: client._count.contracts,
        clientComplaints: client._count.complaints,
      },
    });
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(
    id: string,
    data: UpdateClientInput,
    updatedBy: string,
  ): Promise<ClientResponse> {
    const existing = await prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Client ${id} not found`);

    // contacts is a relation, not a column: passing the payload straight to
    // Prisma with it still attached throws. It is handled through the contact
    // endpoints instead, so editing a client cannot silently drop contacts the
    // form never loaded.
    // `portal` is dropped alongside contacts: neither is a column on Client,
    // and portal access is changed through its own endpoints, never as a
    // side effect of editing the billing terms.
    const {
      contacts: _ignored, portal: _portalIgnored,
      email, billingAddress, tin, referredBy, leadSource, ...fields
    } = data;

    const updated = await prisma.client.update({
      where: { id },
      data: {
        ...fields,
        // Same blank-is-absent rule as create(), applied only to the keys
        // actually sent so a PATCH of one field does not blank the others.
        ...(email          !== undefined ? { email:          blankToNull(email) } : {}),
        ...(billingAddress !== undefined ? { billingAddress: blankToNull(billingAddress) } : {}),
        ...(tin            !== undefined ? { tin:            blankToNull(tin) } : {}),
        ...(referredBy     !== undefined ? { referredBy:     blankToNull(referredBy) } : {}),
        ...(leadSource     !== undefined ? { leadSource:     blankToNull(leadSource) } : {}),
      },
      include: {
        contacts: { orderBy: CONTACT_ORDER },
        _count: { select: { sites: true, contracts: true, complaints: true } },
      },
    });

    await QueueService.logAudit({
      userId: updatedBy,
      action: 'CLIENT_UPDATED',
      entity: 'client',
      entityId: id,
      oldValue: { clientName: existing.clientName, contractStatus: existing.contractStatus },
      newValue: { clientName: updated.clientName, contractStatus: updated.contractStatus },
    });

    return toClientResponse({
      ...updated,
      _count: {
        sites: updated._count.sites,
        contracts: updated._count.contracts,
        clientComplaints: updated._count.complaints,
      },
    });
  }

  // ── Archive ────────────────────────────────────────────────────────────────

  async archive(id: string, updatedBy: string): Promise<ClientResponse> {
    const existing = await prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Client ${id} not found`);

    const updated = await prisma.client.update({
      where: { id },
      data: { contractStatus: 'INACTIVE' },
      include: {
        contacts: { orderBy: CONTACT_ORDER },
        _count: { select: { sites: true, contracts: true, complaints: true } },
      },
    });

    await QueueService.logAudit({
      userId: updatedBy,
      action: 'CLIENT_ARCHIVED',
      entity: 'client',
      entityId: id,
      oldValue: { contractStatus: existing.contractStatus },
      newValue: { contractStatus: 'INACTIVE' },
    });

    return toClientResponse({
      ...updated,
      _count: {
        sites: updated._count.sites,
        contracts: updated._count.contracts,
        clientComplaints: updated._count.complaints,
      },
    });
  }

  // ── Contact persons ────────────────────────────────────────────────────────

  async listContacts(clientId: string): Promise<ClientContactResponse[]> {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new NotFoundError(`Client ${clientId} not found`);

    const contacts = await prisma.clientContact.findMany({
      where:   { clientId },
      orderBy: CONTACT_ORDER,
    });
    return contacts.map(toContactResponse);
  }

  /**
   * Keeps contactType and isPrimary from contradicting each other.
   *
   * The two overlap: a row typed PRIMARY that is not the primary contact renders
   * as a card headed "⭐ Primary Contact" while the primary badge sits on a
   * different card. So promotion retypes a plain SECONDARY as PRIMARY, and
   * demotion sends a PRIMARY back to SECONDARY.
   *
   * BILLING, OPERATIONS and OTHER are left alone in both directions — those say
   * what the person does, which does not stop being true when they become the
   * main point of contact.
   */
  private typeOnPromotion = (current: string) => (current === 'SECONDARY' ? 'PRIMARY' : current);
  private typeOnDemotion  = (current: string) => (current === 'PRIMARY' ? 'SECONDARY' : current);

  /**
   * Copies the primary contact onto the client's own columns.
   *
   * Invoices, the portal and MoMo disbursement read Client.contactPerson and
   * contactPhone. Left unmirrored they would keep naming whoever was primary on
   * the day the client was created, and an invoice would go out addressed to
   * someone who left the company.
   */
  private async mirrorPrimary(clientId: string, tx = prisma) {
    const primary = await tx.clientContact.findFirst({
      where:   { clientId },
      orderBy: CONTACT_ORDER,
    });
    if (!primary) return;

    await tx.client.update({
      where: { id: clientId },
      data:  {
        contactPerson: primary.name,
        // Only when there is one: contactPhone is NOT NULL, and blanking it
        // would break invoice disbursement for the sake of tidiness.
        ...(primary.phone ? { contactPhone: primary.phone } : {}),
      },
    });
  }

  async addContact(
    clientId: string,
    data: ClientContactInput,
    userId: string,
  ): Promise<ClientContactResponse> {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new NotFoundError(`Client ${clientId} not found`);

    const contact = await prisma.$transaction(async (tx) => {
      // A second primary is demoted rather than rejected: marking someone
      // primary is a statement about them, and refusing it would make the user
      // demote the old one first for no reason they could see.
      if (data.isPrimary) {
        const outgoing = await tx.clientContact.findMany({ where: { clientId, isPrimary: true } });
        for (const o of outgoing) {
          await tx.clientContact.update({
            where: { id: o.id },
            data:  { isPrimary: false, contactType: this.typeOnDemotion(o.contactType) },
          });
        }
      }

      return tx.clientContact.create({
        data: {
          clientId,
          contactType: data.contactType ?? (data.isPrimary ? 'PRIMARY' : 'SECONDARY'),
          name:        data.name.trim(),
          phone:       blankToNull(data.phone),
          email:       blankToNull(data.email),
          jobTitle:    blankToNull(data.jobTitle),
          isPrimary:   data.isPrimary ?? false,
          notes:       blankToNull(data.notes),
        },
      });
    });

    await this.mirrorPrimary(clientId);

    await QueueService.logAudit({
      userId,
      action:   'CLIENT_CONTACT_ADDED',
      entity:   'client',
      entityId: clientId,
      newValue: { name: contact.name, contactType: contact.contactType },
    });

    return toContactResponse(contact);
  }

  async updateContact(
    clientId: string,
    contactId: string,
    data: Partial<ClientContactInput>,
    userId: string,
  ): Promise<ClientContactResponse> {
    const existing = await prisma.clientContact.findFirst({ where: { id: contactId, clientId } });
    if (!existing) throw new NotFoundError(`Contact ${contactId} not found for this client`);

    const updated = await prisma.$transaction(async (tx) => {
      if (data.isPrimary) {
        const outgoing = await tx.clientContact.findMany({
          where: { clientId, isPrimary: true, id: { not: contactId } },
        });
        for (const o of outgoing) {
          await tx.clientContact.update({
            where: { id: o.id },
            data:  { isPrimary: false, contactType: this.typeOnDemotion(o.contactType) },
          });
        }
      }

      return tx.clientContact.update({
        where: { id: contactId },
        data: {
          ...(data.contactType !== undefined
            ? { contactType: data.contactType }
            : data.isPrimary
              ? { contactType: this.typeOnPromotion(existing.contactType) }
              : {}),
          ...(data.name        !== undefined ? { name: data.name.trim() } : {}),
          ...(data.phone       !== undefined ? { phone: blankToNull(data.phone) } : {}),
          ...(data.email       !== undefined ? { email: blankToNull(data.email) } : {}),
          ...(data.jobTitle    !== undefined ? { jobTitle: blankToNull(data.jobTitle) } : {}),
          ...(data.notes       !== undefined ? { notes: blankToNull(data.notes) } : {}),
          // Demotion is not accepted directly: unticking primary would leave the
          // client with none. Someone else is promoted instead, which demotes
          // this one as a consequence.
          ...(data.isPrimary ? { isPrimary: true } : {}),
        },
      });
    });

    await this.mirrorPrimary(clientId);

    await QueueService.logAudit({
      userId,
      action:   'CLIENT_CONTACT_UPDATED',
      entity:   'client',
      entityId: clientId,
      oldValue: { name: existing.name, isPrimary: existing.isPrimary },
      newValue: { name: updated.name, isPrimary: updated.isPrimary },
    });

    return toContactResponse(updated);
  }

  async deleteContact(clientId: string, contactId: string, userId: string): Promise<void> {
    const existing = await prisma.clientContact.findFirst({ where: { id: contactId, clientId } });
    if (!existing) throw new NotFoundError(`Contact ${contactId} not found for this client`);

    // The last one stays. contactPerson is NOT NULL and an invoice has to be
    // addressed to somebody — removing the only contact would leave the client
    // unreachable and the next invoice run without a name to use.
    const remaining = await prisma.clientContact.count({ where: { clientId } });
    if (remaining <= 1) {
      throw new AppError(
        'This is the only contact for the client. Add another before removing this one.',
        400,
      );
    }

    await prisma.clientContact.delete({ where: { id: contactId } });

    // Deleting the primary promotes the oldest of the rest, rather than leaving
    // the client with contacts but no primary.
    if (existing.isPrimary) {
      const next = await prisma.clientContact.findFirst({
        where:   { clientId },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await prisma.clientContact.update({
          where: { id: next.id },
          data:  { isPrimary: true, contactType: this.typeOnPromotion(next.contactType) },
        });
      }
    }

    await this.mirrorPrimary(clientId);

    await QueueService.logAudit({
      userId,
      action:   'CLIENT_CONTACT_REMOVED',
      entity:   'client',
      entityId: clientId,
      oldValue: { name: existing.name, contactType: existing.contactType },
    });
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  async getSummary(): Promise<ClientSummary> {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const [totalActive, totalInactive, expiringContracts, openComplaints] =
      await Promise.all([
        prisma.client.count({ where: { contractStatus: 'ACTIVE' } }),
        prisma.client.count({ where: { contractStatus: 'INACTIVE' } }),
        prisma.contract.count({
          where: {
            contractEnd: { lte: thirtyDaysFromNow, gte: new Date() },
            status: { in: ['ACTIVE', 'EXPIRING'] },
          },
        }),
        prisma.clientComplaint.count({ where: { status: 'OPEN' } }),
      ]);

    return { totalActive, totalInactive, expiringContracts, openComplaints };
  }
}

export const clientService = new ClientService();
