import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import LocalController from "../controllers/LocalController";
import { compressImages } from "../middlewares/compression.middleware";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminAuthMiddleware } from "../middlewares/adminAuth.middleware";
import { imageOrPdfFileFilter } from "../middlewares/fileFilter";

// Define o caminho para a pasta de uploads de forma segura
const UPLOADS_DIR = path.resolve("uploads");

// Garante que a pasta de uploads exista ao iniciar a aplicação
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  // Define o destino para ser SEMPRE a pasta 'uploads' raiz
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  // Mantém a lógica para gerar um nome de arquivo único
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
    );
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Limite de 10 MB para cada arquivo
  },
  fileFilter: imageOrPdfFileFilter,
});

const router = Router();

/**
 * @swagger
 * /api/locais:
 *   get:
 *     summary: Lista todos os locais ativos
 *     tags: [Locais]
 *     responses:
 *       200:
 *         description: Lista de locais ativos.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Local' }
 */
router.get("/", LocalController.listarTodos);

/**
 * @swagger
 * /api/locais/buscar:
 *   get:
 *     summary: Busca locais ativos por nome (parcial)
 *     tags: [Locais]
 *     parameters:
 *       - in: query
 *         name: nome
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Locais encontrados.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Local' }
 */
router.get("/buscar", LocalController.buscarPorNome);

/**
 * @swagger
 * /api/locais/nome/{nome}:
 *   get:
 *     summary: Busca locais ativos por nome (parcial, via path param)
 *     tags: [Locais]
 *     parameters:
 *       - in: path
 *         name: nome
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Locais encontrados.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Local' }
 */
router.get("/nome/:nome", LocalController.buscarPorNome);

/**
 * @swagger
 * /api/locais/{id}:
 *   get:
 *     summary: Busca um local ativo por ID, com avaliações (e respostas) aninhadas
 *     tags: [Locais]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Local encontrado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Local' }
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 */
router.get("/:id", LocalController.buscarPorId);

/**
 * @swagger
 * /api/locais/categoria/{categoria}:
 *   get:
 *     summary: Lista locais ativos de uma categoria (correspondência parcial)
 *     tags: [Locais]
 *     parameters:
 *       - in: path
 *         name: categoria
 *         required: true
 *         schema: { type: string, example: "comercio-e-lojas" }
 *     responses:
 *       200:
 *         description: Locais da categoria.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Local' }
 */
router.get("/categoria/:categoria", LocalController.buscarPorCategoria);

/**
 * @swagger
 * /api/locais:
 *   post:
 *     summary: Cadastra um novo local (fica pendente de aprovação do admin)
 *     tags: [Locais]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [nomeLocal, categoria, nomeResponsavel, cpfResponsavel, emailResponsavel, contatoResponsavel]
 *             properties:
 *               nomeLocal: { type: string }
 *               categoria: { type: string }
 *               descricao: { type: string }
 *               endereco: { type: string }
 *               nomeResponsavel: { type: string }
 *               cpfResponsavel: { type: string }
 *               emailResponsavel: { type: string, format: email }
 *               contatoResponsavel: { type: string }
 *               logo: { type: string, format: binary }
 *               alvara_funcionamento: { type: string, format: binary }
 *               vigilancia_sanitaria: { type: string, format: binary }
 *               imagens: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       201:
 *         description: Local cadastrado, aguardando aprovação.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Local' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.post(
  "/",
  authMiddleware,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "imagens", maxCount: 12 },
    { name: "portfolio", maxCount: 12 },
    { name: "produtos", maxCount: 12 },
    { name: "produtosImg", maxCount: 12 },
    { name: "localImg", maxCount: 12 },
    { name: "vigilancia_sanitaria", maxCount: 1 },
    { name: "alvara_funcionamento", maxCount: 1 }
  ]),
  compressImages,
  LocalController.cadastrar,
);

/**
 * @swagger
 * /api/locais/{id}/solicitar-atualizacao:
 *   put:
 *     summary: Solicita atualização de dados de um local (fica pendente de aprovação)
 *     tags: [Locais]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             description: Mesmos campos do cadastro; apenas os enviados são considerados na atualização.
 *     responses:
 *       200:
 *         description: Solicitação registrada.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Local' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *   post:
 *     summary: Idêntico ao PUT acima (existe para compatibilidade com clientes/proxies que bloqueiam PUT multipart)
 *     tags: [Locais]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Solicitação registrada.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Local' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.put(
  "/:id/solicitar-atualizacao",
  authMiddleware,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "imagens", maxCount: 12 },
    { name: "portfolio", maxCount: 12 },
    { name: "produtos", maxCount: 12 },
    { name: "produtosImg", maxCount: 12 },
    { name: "localImg", maxCount: 12 },
    { name: "vigilancia_sanitaria", maxCount: 1 }, // Adicionado
    { name: "alvara_funcionamento", maxCount: 1 }, // Adicionado
  ]),
  compressImages,
  LocalController.solicitarAtualizacao,
);

router.post(
  "/:id/solicitar-atualizacao",
  authMiddleware,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "imagens", maxCount: 12 },
    { name: "portfolio", maxCount: 12 },
    { name: "produtos", maxCount: 12 },
    { name: "produtosImg", maxCount: 12 },
    { name: "localImg", maxCount: 12 },
    { name: "vigilancia_sanitaria", maxCount: 1 }, // Adicionado
    { name: "alvara_funcionamento", maxCount: 1 }, // Adicionado
  ]),
  compressImages,
  LocalController.solicitarAtualizacao,
);

/**
 * @swagger
 * /api/locais/solicitar-exclusao:
 *   post:
 *     summary: Solicita a exclusão do local do usuário logado (fica pendente de aprovação)
 *     tags: [Locais]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               localId: { type: integer, description: "Opcional — se omitido, usa o último local cadastrado pelo usuário logado." }
 *     responses:
 *       200:
 *         description: Solicitação de exclusão enviada.
 *       400:
 *         description: Não foi possível identificar o local.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       403:
 *         description: O usuário logado não é dono deste local.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(
  "/solicitar-exclusao",
  authMiddleware,
  upload.fields([{ name: "alvara_funcionamento", maxCount: 1 }]),
  LocalController.solicitarExclusao,
);

/**
 * @swagger
 * /api/locais/{id}/status:
 *   post:
 *     summary: Ativa ou desativa um local diretamente pelo ID (via administrativa)
 *     description: Equivalente a PATCH /api/admin/local/{id}/ativo, mantido por compatibilidade.
 *     tags: [Locais]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ativo]
 *             properties:
 *               ativo: { type: boolean }
 *     responses:
 *       200:
 *         description: Status atualizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Local' }
 *       400:
 *         description: "'ativo' precisa ser booleano."
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.post("/:id/status", adminAuthMiddleware, LocalController.alterarStatus);

/**
 * @swagger
 * /api/locais/visualizacao/{identificador}:
 *   post:
 *     summary: Incrementa o contador de visualizações de uma página/categoria (analytics simples)
 *     tags: [Locais]
 *     parameters:
 *       - in: path
 *         name: identificador
 *         required: true
 *         schema: { type: string, example: "HOME" }
 *     responses:
 *       200:
 *         description: Contador incrementado.
 *       400:
 *         description: Identificador obrigatório.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(
  "/visualizacao/:identificador",
  LocalController.registrarVisualizacao,
);

export default router;
