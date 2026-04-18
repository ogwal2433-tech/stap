import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { PaginatedResponse } from '@stap/shared';
import type { NotificationResponse } from '@stap/shared';

// ── Helpers ────────────────────────────────────────────────────────────────────

function computeTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);

  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (days < 7)   return `${days} day${days === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtNotification(n: any): NotificationResponse {
  return {
    id:         n.id,
    type:       n.type,
    title:      n.title,
    message:    n.message,
    isRead:     n.isRead,
    readAt:     n.readAt?.toISOString() ?? null,
    entityType: n.entityType ?? null,
    entityId:   n.entityId  ?? null,
    createdAt:  n.createdAt.toISOString(),
    timeAgo:    computeTimeAgo(n.createdAt),
  };
}

// ── Service ────────────────────────────────────────────────────────────────────

class NotificationService {
  /** Send a notification to a single user via configured channels. */
  async send(params: {
    userId:      string;
    type:        string;
    title:       string;
    message:     string;
    entityType?: string;
    entityId?:   string;
    channels?:   ('inApp' | 'email' | 'sms')[];
  }): Promise<void> {
    // Fetch user + their role's preferences
    const user = await prisma.user.findUnique({ where: { id: params.userId } });
    if (!user) return;

    let inAppEnabled = true;
    let emailEnabled = false;
    let smsEnabled   = false;

    if (params.channels) {
      inAppEnabled = params.channels.includes('inApp');
      emailEnabled = params.channels.includes('email');
      smsEnabled   = params.channels.includes('sms');
    } else {
      const pref = await prisma.notificationPreference.findUnique({
        where: { role: user.role },
      });
      if (pref) {
        const p = (pref.preferences as any)[params.type] ?? {};
        inAppEnabled = p.inApp ?? true;
        emailEnabled = p.email ?? false;
        smsEnabled   = p.sms   ?? false;
      }
    }

    const jobs: Promise<any>[] = [];

    if (inAppEnabled) {
      jobs.push(
        prisma.notification.create({
          data: {
            userId:     params.userId,
            type:       params.type,
            title:      params.title,
            message:    params.message,
            entityType: params.entityType,
            entityId:   params.entityId,
          },
        }),
      );
    }

    if (emailEnabled && user.email) {
      jobs.push(
        QueueService.sendEmail({
          to:       user.email,
          subject:  params.title,
          template: 'notification',
          data:     { title: params.title, message: params.message, type: params.type },
        }),
      );
    }

    if (smsEnabled && (user as any).phone) {
      jobs.push(
        QueueService.sendSms({
          to:      (user as any).phone,
          message: `STAP: ${params.title} — ${params.message.substring(0, 100)}`,
        }),
      );
    }

    await Promise.all(jobs);
  }

  /** Send a notification to all users with a given role. */
  async sendToRole(params: {
    role:        string;
    type:        string;
    title:       string;
    message:     string;
    entityType?: string;
    entityId?:   string;
  }): Promise<void> {
    const users = await prisma.user.findMany({ where: { role: params.role as any } });
    await Promise.all(
      users.map(u =>
        this.send({ ...params, userId: u.id }),
      ),
    );
  }

  /** Send a notification to all users across multiple roles. */
  async sendToRoles(
    roles: string[],
    params: { type: string; title: string; message: string; entityType?: string; entityId?: string },
  ): Promise<void> {
    await Promise.all(roles.map(role => this.sendToRole({ ...params, role })));
  }

  async getForUser(
    userId: string,
    query:  { isRead?: boolean; page: number; limit: number },
  ): Promise<PaginatedResponse<NotificationResponse>> {
    const { page = 1, limit = 20, isRead } = query;
    const where: any = { userId };
    if (isRead !== undefined) where.isRead = isRead;

    const [total, items] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data:       items.map(fmtNotification),
      pagination: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const n = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!n || n.userId !== userId) return;
    await prisma.notification.update({
      where: { id: notificationId },
      data:  { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data:  { isRead: true, readAt: new Date() },
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, isRead: false } });
  }

  async getPreferences(role: string) {
    return prisma.notificationPreference.findUnique({ where: { role } });
  }

  async savePreferences(role: string, preferences: object): Promise<void> {
    await prisma.notificationPreference.upsert({
      where:  { role },
      update: { preferences },
      create: { role, preferences },
    });
  }
}

export const notificationService = new NotificationService();
