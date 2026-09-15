import { Router } from "express";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import FileController from "../controllers/FileController";
import { authMiddleware } from "../middlewares/auth.middleware";
import { imageOrPdfFileFilter } from "../middlewares/fileFilter";

const router = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.resolve(__dirname, "..", "uploads"));
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname);
    cb(null, `${uuidv4()}${extension}`);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Limite de 10 MB para cada arquivo
  },
  fileFilter: imageOrPdfFileFilter,
});

/**
 * @swagger
 * /api/files/upload:
 *   post:
 *     summary: Envia um único arquivo e retorna sua URL pública
 *     tags: [Arquivos]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary, description: "Imagem (JPEG/PNG/WEBP/GIF) ou PDF, até 10MB." }
 *     responses:
 *       200:
 *         description: Upload concluído.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url: { type: string, example: "uploads/1699999999-abc123.webp" }
 *       400:
 *         description: Nenhum arquivo enviado, ou tipo de arquivo não permitido.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.post("/upload", authMiddleware, upload.single("file"), FileController.uploadFile);

/**
 * @swagger
 * /api/files/upload-multiple:
 *   post:
 *     summary: Envia múltiplos arquivos de uma vez e retorna suas URLs
 *     tags: [Arquivos]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [files]
 *             properties:
 *               files:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Uploads concluídos.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 urls:
 *                   type: array
 *                   items: { type: string }
 *       400:
 *         description: Nenhum arquivo enviado, ou tipo de arquivo não permitido.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.post(
  "/upload-multiple",
  authMiddleware,
  upload.array("files"),
  FileController.uploadMultipleFiles
);

export default router;
