import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AppError } from '../errors/AppError';

// Ensure temp upload directory exists
fs.mkdirSync('./public/uploads/temp', { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, './public/uploads/temp');
  },
  filename: (_req, file, cb) => {
    // Sanitise filename — replace whitespace and special chars with hyphens
    const sanitised = file.originalname
      .replace(/[^a-zA-Z0-9.\-_]/g, '-')
      .replace(/-+/g, '-');
    cb(null, `${Date.now()}-${sanitised}`);
  },
});

const ALLOWED_MIMETYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Only PDF, JPG, and PNG files are allowed', 400));
  }
};

export const guardDocumentUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
});

/**
 * Spreadsheet imports. Memory storage: the file is parsed once and never read
 * again, so writing it to disk would leave client lists lying in a temp folder
 * with nothing to clean them up.
 *
 * The mimetype a browser sends for .xls varies by platform and is sometimes
 * application/octet-stream, so the extension is accepted as well.
 */
export const excelImportUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype.includes('spreadsheet') ||
      file.mimetype.includes('excel') ||
      /\.xlsx?$/i.test(file.originalname)
    ) {
      cb(null, true);
    } else {
      cb(new AppError('Only Excel files (.xlsx, .xls) are allowed', 400));
    }
  },
});
