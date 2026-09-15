import { Router } from "express";
import { AdminController } from "../controllers/AdminController";
import { adminAuthMiddleware } from "../middlewares/adminAuth.middleware";
import multer from "multer";


const router = Router();
const upload = multer();

/**
 * @swagger
 * /api/admin/login:
 *   post:
 *     summary: Autentica o admin e retorna um token JWT de admin
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Login bem-sucedido.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 token: { type: string }
 *       401:
 *         description: Credenciais inválidas.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string }
 */
router.post("/login",
  AdminController.login
);

/**
 * @swagger
 * /api/admin/pending:
 *   get:
 *     summary: Lista todas as solicitações pendentes (novos cadastros, atualizações, exclusões e indicações)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Solicitações pendentes agrupadas por tipo.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cadastros: { type: array, items: { $ref: '#/components/schemas/Local' } }
 *                 atualizacoes: { type: array, items: { $ref: '#/components/schemas/Local' } }
 *                 exclusoes: { type: array, items: { $ref: '#/components/schemas/Local' } }
 *                 indicacoes: { type: array, items: { $ref: '#/components/schemas/Local' } }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.get("/pending",
  adminAuthMiddleware,
  AdminController.getPending
);

/**
 * @swagger
 * /api/admin/approve/{id}:
 *   post:
 *     summary: Aprova a solicitação pendente de um local (cadastro, atualização ou exclusão) e notifica por e-mail
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Solicitação aprovada.
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 */
router.post(
  "/approve/:id",
  adminAuthMiddleware,
  AdminController.approveRequest
);

/**
 * @swagger
 * /api/admin/edit-and-approve/{id}:
 *   post:
 *     summary: Edita os dados de um local pendente e já aprova em seguida
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             description: Campos de Local a editar (whitelist), mais "urlsParaExcluir" (array/JSON de URLs de imagens a remover) e "logoUrl":"DELETE" para remover a logo.
 *     responses:
 *       200:
 *         description: Local editado e aprovado.
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 */
router.post(
  "/edit-and-approve/:id",
  adminAuthMiddleware,
  upload.any(),
  AdminController.editAndApproveRequest
);

/**
 * @swagger
 * /api/admin/reject/{id}:
 *   post:
 *     summary: Rejeita a solicitação pendente de um local e notifica por e-mail com o motivo
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, description: "Motivo da rejeição, incluído no e-mail enviado ao estabelecimento." }
 *     responses:
 *       200:
 *         description: Solicitação rejeitada.
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 */
router.post(
  "/reject/:id",
  adminAuthMiddleware,
  AdminController.rejectRequest
);

/**
 * @swagger
 * /api/admin/locais-ativos:
 *   get:
 *     summary: Lista todos os locais ativos (visão administrativa)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Locais ativos.
 *         content:
 *           application/json:
 *             schema: { type: array, items: { $ref: '#/components/schemas/Local' } }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.get(
  "/locais-ativos",
  adminAuthMiddleware,
  AdminController.getAllActiveLocal
);

/**
 * @swagger
 * /api/admin/locais-inativos:
 *   get:
 *     summary: Lista todos os locais inativos
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Locais inativos.
 *         content:
 *           application/json:
 *             schema: { type: array, items: { $ref: '#/components/schemas/Local' } }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.get(
  "/locais-inativos",
  adminAuthMiddleware,
  AdminController.getInactiveLocals
);

/**
 * @swagger
 * /api/admin/local/{id}:
 *   patch:
 *     summary: Edita os dados de um local já ativo/pendente (sem depender de um fluxo de aprovação)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             description: Campos de Local a editar (whitelist), mais "urlsParaExcluir" e "logoUrl":"DELETE"/null para remover a logo.
 *     responses:
 *       200:
 *         description: Local editado.
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *   delete:
 *     summary: Exclui definitivamente um local (e suas imagens)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Local excluído.
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.patch(
  "/local/:id",
  adminAuthMiddleware,
  upload.any(),
  AdminController.adminUpdateLocal
);

router.delete(
  "/local/:id",
  adminAuthMiddleware,
  AdminController.deleteLocal
);

/**
 * @swagger
 * /api/admin/local/{id}/ativo:
 *   patch:
 *     summary: Ativa ou desativa um local (via administrativa, protegida)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ativo: { type: boolean, description: "Se omitido, inverte o valor atual." }
 *     responses:
 *       200:
 *         description: Status alterado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ativo, inativo] }
 *                 local: { $ref: '#/components/schemas/Local' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 */
router.patch(
  "/local/:id/ativo",
  adminAuthMiddleware,
  AdminController.toggleLocalAtivo
);

/**
 * @swagger
 * /api/admin/avaliacoes/local/{localId}:
 *   get:
 *     summary: Lista as avaliações de um local (visão administrativa, com e-mail do autor)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: localId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Local e suas avaliações.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 local: { $ref: '#/components/schemas/Local' }
 *                 avaliacoes: { type: array, items: { $ref: '#/components/schemas/Avaliacao' } }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 */
router.get(
  "/avaliacoes/local/:localId",
  adminAuthMiddleware,
  AdminController.getAvaliacoesByLocal
);

/**
 * @swagger
 * /api/admin/avaliacoes/{id}:
 *   delete:
 *     summary: Exclui qualquer avaliação (moderação)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Avaliação excluída.
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 */
router.delete(
  "/avaliacoes/:id",
  adminAuthMiddleware,
  AdminController.adminDeleteAvaliacao
);

/**
 * @swagger
 * /api/admin/exportar-locais:
 *   get:
 *     summary: Exporta os locais ativos em CSV
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Arquivo CSV.
 *         content:
 *           text/csv:
 *             schema: { type: string }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         description: Nenhum local ativo para exportar.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(
  "/exportar-locais",
  adminAuthMiddleware,
  AdminController.exportActiveLocals
);

/**
 * @swagger
 * /api/admin/dashboard-stats:
 *   get:
 *     summary: Estatísticas agregadas para o painel (contagens, distribuição de notas, page views, etc)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Estatísticas.
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.get(
  "/dashboard-stats",
  adminAuthMiddleware,
  AdminController.getDashboardStats
);

// =====================
// Rotas de gerenciamento de usuários (Admin)
// =====================

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Lista todos os usuários, com contagem de comentários e locais de cada um
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Lista de usuários.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: '#/components/schemas/Usuario'
 *                   - type: object
 *                     properties:
 *                       interacoes:
 *                         type: object
 *                         properties:
 *                           comentariosCount: { type: integer }
 *                           projetosCount: { type: integer }
 *                           fezComentario: { type: boolean }
 *                           temProjetoCadastrado: { type: boolean }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.get(
  "/users",
  adminAuthMiddleware,
  AdminController.getAllUsers
);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   put:
 *     summary: Edita nome/username/e-mail de qualquer usuário
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nomeCompleto: { type: string }
 *               username: { type: string }
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Usuário atualizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Usuario' }
 *       400:
 *         description: Dados inválidos ou em uso.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *   delete:
 *     summary: Exclui qualquer usuário (e suas avaliações)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Usuário excluído.
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.put(
  "/users/:id",
  adminAuthMiddleware,
  AdminController.adminUpdateUser
);

router.delete(
  "/users/:id",
  adminAuthMiddleware,
  AdminController.adminDeleteUser
);

/**
 * @swagger
 * /api/admin/users/{id}/password:
 *   patch:
 *     summary: Define uma nova senha para qualquer usuário (sem exigir a senha atual)
 *     tags: [Admin]
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
 *             required: [newPassword]
 *             properties:
 *               newPassword: { type: string, format: password, minLength: 6 }
 *     responses:
 *       200:
 *         description: Senha atualizada.
 *       400:
 *         description: Nova senha ausente ou curta demais.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 */
router.patch(
  "/users/:id/password",
  adminAuthMiddleware,
  AdminController.adminChangeUserPassword
);

/**
 * @swagger
 * /api/admin/users/{id}/resend-confirmation:
 *   post:
 *     summary: Reenvia o e-mail de confirmação de conta para um usuário ainda não verificado
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: E-mail reenviado.
 *       400:
 *         description: Usuário já verificado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 */
router.post(
  "/users/:id/resend-confirmation",
  adminAuthMiddleware,
  AdminController.resendConfirmationEmail
);


export default router;
