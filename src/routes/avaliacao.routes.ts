
import { Router } from "express";
import AvaliacaoController from "../controllers/AvaliacaoController";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

/**
 * @swagger
 * /api/avaliacoes/local/{id}:
 *   get:
 *     summary: Lista os comentários principais de um local, com suas respostas aninhadas
 *     tags: [Avaliações]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: ID do local.
 *     responses:
 *       200:
 *         description: Lista de avaliações.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Avaliacao' }
 */
router.get(
  "/local/:id",
  AvaliacaoController.listarPorLocal
);


/**
 * @swagger
 * /api/avaliacoes:
 *   post:
 *     summary: Cria um comentário/avaliação (ou uma resposta a um comentário)
 *     tags: [Avaliações]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [localId]
 *             properties:
 *               localId: { type: integer }
 *               comentario: { type: string }
 *               nota: { type: integer, minimum: 1, maximum: 5, description: "Obrigatório para comentários principais; ignorado em respostas." }
 *               parent_id: { type: integer, description: "Informe para criar uma resposta a este comentário." }
 *     responses:
 *       201:
 *         description: Avaliação criada.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Avaliacao' }
 *       400:
 *         description: Validação falhou (palavrão, emoji, nota fora do intervalo, comentário duplicado, etc).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.post("/",
  authMiddleware,
  AvaliacaoController.submeterAvaliacao
);

/**
 * @swagger
 * /api/avaliacoes/{id}:
 *   put:
 *     summary: Edita um comentário/avaliação do próprio usuário logado
 *     tags: [Avaliações]
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
 *               comentario: { type: string }
 *               nota: { type: integer, minimum: 1, maximum: 5 }
 *     responses:
 *       200:
 *         description: Avaliação atualizada.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Avaliacao' }
 *       400:
 *         description: Avaliação não encontrada ou o usuário logado não é o autor.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *   delete:
 *     summary: Exclui um comentário/avaliação do próprio usuário logado
 *     tags: [Avaliações]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Excluída com sucesso.
 *       400:
 *         description: Avaliação não encontrada ou o usuário logado não é o autor.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.put("/:id",
  authMiddleware,
  AvaliacaoController.atualizarAvaliacao
);
router.delete("/:id",
  authMiddleware,
  AvaliacaoController.excluirAvaliacao
);

export default router;
