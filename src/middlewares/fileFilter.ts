import { Request } from "express";
import multer from "multer";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

/**
 * Restringe uploads a imagens (usadas em logos/fotos/portfólio) e PDF
 * (usado nos documentos de alvará/vigilância sanitária).
 */
export function imageOrPdfFileFilter(
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Tipo de arquivo não permitido. Envie apenas imagens (JPEG, PNG, WEBP, GIF) ou PDF."));
  }
}
