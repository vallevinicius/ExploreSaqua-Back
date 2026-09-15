import { Router } from "express";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import FileController from "../controllers/FileController";

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
});

/**
 * @swagger
 * /api/files/upload:
 *   post:
 *     summary: Envia um único arquivo e retorna sua URL pública
 *     description: >
 *       Atenção: esta rota não exige autenticação nem valida o tipo do arquivo hoje —
 *       qualquer visitante pode enviar qualquer tipo de arquivo, que fica publicamente
 *       acessível em /uploads.
 *     tags: [Arquivos]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary }
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
 *         description: Nenhum arquivo enviado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post("/upload", upload.single("file"), FileController.uploadFile);

/**
 * @swagger
 * /api/files/upload-multiple:
 *   post:
 *     summary: Envia múltiplos arquivos de uma vez e retorna suas URLs
 *     description: >
 *       Mesma observação de segurança do /upload — sem autenticação nem validação de tipo hoje.
 *     tags: [Arquivos]
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
 *         description: Nenhum arquivo enviado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(
  "/upload-multiple",
  upload.array("files"),
  FileController.uploadMultipleFiles
);

export default router;
