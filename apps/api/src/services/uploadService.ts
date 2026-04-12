import fs from 'fs';
import path from 'path';
import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { AppError } from '../errors/AppError';
import type { GuardDocumentResponse } from '@stap/shared';

class UploadService {
  /**
   * Stub virus scanner.
   * TODO Sprint 4: integrate ClamAV via node-clam or clamscan npm package.
   * The real implementation will run: clamscan.scanFile(filePath)
   */
  async scanFile(filePath: string): Promise<{ clean: boolean; threat?: string }> {
    const filename = path.basename(filePath);
    console.log(`🔍 Virus scan: ${filename} — CLEAN (ClamAV stub)`);
    return { clean: true };
  }

  async saveGuardDocument(
    guardId: string,
    file: Express.Multer.File,
    documentType: string,
    uploadedBy: string,
  ): Promise<GuardDocumentResponse> {
    // 1. Virus scan
    const scanResult = await this.scanFile(file.path);
    if (!scanResult.clean) {
      fs.unlinkSync(file.path); // Remove rejected file
      throw new AppError('File rejected by virus scanner', 422);
    }

    // 2. Determine version: count existing docs of this type for this guard + 1
    const existingCount = await prisma.guardDocument.count({
      where: { guardId, documentType: documentType as never, deletedAt: null },
    });
    const version = existingCount + 1;

    // 3. Build the destination path
    //    TODO Sprint 4 infra: replace local disk storage with DigitalOcean Spaces / S3
    //    using AWS SDK — uploadToS3(file, key) — return CDN URL
    const destDir = path.join(
      process.cwd(),
      'public',
      'uploads',
      'guards',
      guardId,
      documentType,
    );
    fs.mkdirSync(destDir, { recursive: true });

    const destFilename = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '-')}`;
    const destPath = path.join(destDir, destFilename);

    // Move from temp to final location
    fs.renameSync(file.path, destPath);

    // Web-accessible path
    const webPath = `/uploads/guards/${guardId}/${documentType}/${destFilename}`;

    // 4. Persist to DB
    const doc = await prisma.guardDocument.create({
      data: {
        guardId,
        documentType: documentType as never,
        filePath: webPath,
        version,
        uploadedBy,
      },
      include: {
        uploader: { select: { name: true } },
      },
    });

    // 5. Audit log
    await QueueService.logAudit({
      userId: uploadedBy,
      action: 'DOCUMENT_UPLOADED',
      entity: 'guardDocument',
      entityId: doc.id,
      newValue: { guardId, documentType, version, filePath: webPath },
    });

    return {
      id: doc.id,
      documentType: doc.documentType,
      filePath: doc.filePath,
      version: doc.version,
      uploadedAt: doc.uploadedAt.toISOString(),
      uploadedBy: { name: doc.uploader.name },
      deletedAt: null,
    };
  }
}

export const uploadService = new UploadService();
