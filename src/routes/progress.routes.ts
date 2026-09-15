import { Router } from 'express';
import ProgressController from '../controllers/ProgressController';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

/**
 * @swagger
 * /api/users/{userId}/progress:
 *   get:
 *     summary: Retorna o progresso de exploração do usuário (% de locais ativos visitados)
 *     tags: [Progresso]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *         description: Precisa ser o mesmo ID do usuário autenticado.
 *     responses:
 *       200:
 *         description: Progresso calculado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId: { type: integer }
 *                 progressPercentage: { type: number, example: 27.27 }
 *                 visitedCount: { type: integer }
 *                 totalLocations: { type: integer }
 *                 tag: { type: string, example: "Explorador" }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       403:
 *         description: O ID na URL não é o do usuário autenticado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/:userId/progress', ProgressController.getProgress);

export default router;
