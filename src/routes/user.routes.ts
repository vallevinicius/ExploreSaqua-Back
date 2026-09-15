import { Router } from 'express';
import UserController from '../controllers/UserController';
import prisma from '../prisma';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { compressImages } from '../middlewares/compression.middleware';
import { haversineDistanceMeters } from '../utils/geo';

const MAX_VISIT_DISTANCE_METERS = 500;

const UPLOADS_DIR = path.resolve("uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const router = Router();

/**
 * @swagger
 * /api/users/profile:
 *   post:
 *     summary: Atualiza nome, username e/ou e-mail do usuário logado
 *     description: Ao trocar o e-mail, um link de confirmação é enviado para o novo endereço antes de ele passar a valer.
 *     tags: [Perfil]
 *     security: [{ bearerAuth: [] }]
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
 *         description: Perfil atualizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Usuario' }
 *       400:
 *         description: Username/e-mail em uso ou conteúdo inválido.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *   delete:
 *     summary: Exclui a conta do usuário logado (e suas avaliações)
 *     tags: [Perfil]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Conta excluída.
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.post('/profile',
    UserController.updateUserProfile
);

/**
 * @swagger
 * /api/users/profile/estabelecimentos:
 *   get:
 *     summary: Lista os estabelecimentos (locais) cadastrados pelo usuário logado
 *     tags: [Perfil]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: usuarioId
 *         schema: { type: integer }
 *         description: Somente para chamadas feitas com token de admin — filtra por outro usuário.
 *     responses:
 *       200:
 *         description: Lista de estabelecimentos.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total: { type: integer }
 *                 locais:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Local' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.get('/profile/estabelecimentos',
  UserController.listarMeusEstabelecimentos
);

/**
 * @swagger
 * /api/users/profile/comentarios:
 *   get:
 *     summary: Lista os comentários feitos pelo usuário logado
 *     tags: [Perfil]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Lista de comentários.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total: { type: integer }
 *                 comentarios:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Avaliacao' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.get('/profile/comentarios',
  UserController.listarMeusComentarios
);

/**
 * @swagger
 * /api/users/profile/avaliacoes:
 *   get:
 *     summary: Lista as avaliações feitas pelo usuário logado
 *     tags: [Perfil]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Lista de avaliações.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total: { type: integer }
 *                 avaliacoes:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Avaliacao' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.get('/profile/avaliacoes',
  UserController.listarMinhasAvaliacoes
);

/**
 * @swagger
 * /api/users/profile/reviews:
 *   get:
 *     summary: Alias de /api/users/profile/avaliacoes
 *     tags: [Perfil]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Lista de avaliações.
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.get('/profile/reviews',
  UserController.listarMeusReviews
);

/**
 * @swagger
 * /api/users/profile/estabelecimentos/{localId}:
 *   put:
 *     summary: Atualiza um estabelecimento que pertence ao usuário logado
 *     tags: [Perfil]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: localId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               nomeLocal: { type: string }
 *               categoria: { type: string }
 *               descricao: { type: string }
 *               endereco: { type: string }
 *               instagram: { type: string }
 *               contatoLocal: { type: string }
 *               logo: { type: string, format: binary }
 *               imagens: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       200:
 *         description: Estabelecimento atualizado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 local: { $ref: '#/components/schemas/Local' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       403:
 *         description: O usuário logado não é dono deste estabelecimento.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 */
router.put('/profile/estabelecimentos/:localId',
    upload.fields([
        { name: "logo", maxCount: 1 },
    { name: "logoUrl", maxCount: 1 },
        { name: "imagens", maxCount: 4 },
    { name: "portfolio", maxCount: 12 },
    { name: "produtos", maxCount: 12 },
    { name: "produtosImg", maxCount: 12 },
    { name: "localImg", maxCount: 12 },
    ]),
  compressImages,
    UserController.atualizarMeuEstabelecimento
);
router.delete('/profile',
    UserController.deleteUserProfile
);

/**
 * @swagger
 * /api/users/password:
 *   put:
 *     summary: Altera a senha do usuário logado (exige a senha atual)
 *     tags: [Perfil]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string, format: password }
 *               newPassword: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Senha alterada com sucesso.
 *       400:
 *         description: Senha atual incorreta.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.put('/password',
    UserController.updateUserPassword
);

/**
 * @swagger
 * /api/users/{userId}/visits:
 *   post:
 *     summary: Marca que o usuário logado visitou um local
 *     tags: [Perfil]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *         description: Precisa ser o mesmo ID do usuário autenticado.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [localId, latitude, longitude]
 *             properties:
 *               localId: { type: integer }
 *               latitude: { type: number, description: "Latitude atual do usuário (obtida via geolocalização do navegador)." }
 *               longitude: { type: number, description: "Longitude atual do usuário." }
 *     responses:
 *       200:
 *         description: Visita registrada (nova ou atualizada).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 visited: { type: boolean }
 *                 created: { type: boolean, description: "true se era a primeira visita a este local." }
 *       400:
 *         description: Parâmetros inválidos, local sem coordenadas cadastradas, ou usuário a mais de 500m do local.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: O ID na URL não é o do usuário autenticado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 */
router.post('/:userId/visits', async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const { localId, latitude, longitude } = req.body;

    if (Number.isNaN(userId) || !localId) {
      return res.status(400).json({ message: 'Parâmetros inválidos' });
    }

    const userLat = Number(latitude);
    const userLng = Number(longitude);
    if (
      latitude === undefined ||
      longitude === undefined ||
      Number.isNaN(userLat) ||
      Number.isNaN(userLng)
    ) {
      return res.status(400).json({
        message: 'É necessário informar sua localização atual (latitude/longitude) para confirmar a visita.',
      });
    }

    // checar usuário autenticado
    const authUser = (req as any).user;
    if (!authUser || authUser.id !== userId) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    // Verifica existência do usuário
    const user = await prisma.usuario.findUnique({ where: { usuarioId: userId } });
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });

    // Verifica existência do local
    const local = await prisma.local.findUnique({ where: { localId: Number(localId) } });
    if (!local) return res.status(404).json({ message: 'Local não encontrado' });

    // O local precisa ter coordenadas cadastradas para permitir a validação de distância
    if (local.latitude == null || local.longitude == null) {
      return res.status(400).json({
        message: 'Este local não possui localização cadastrada — não é possível confirmar a visita.',
      });
    }

    const distancia = haversineDistanceMeters(userLat, userLng, local.latitude, local.longitude);
    if (distancia > MAX_VISIT_DISTANCE_METERS) {
      return res.status(400).json({
        message: `Você está a ${Math.round(distancia)}m do local. Precisa estar a até ${MAX_VISIT_DISTANCE_METERS}m para confirmar a visita.`,
      });
    }

    // Cria ou atualiza registro de visita
    const existing = await prisma.usuarioLocal.findFirst({
      where: { usuarioId: userId, localId: Number(localId) },
    });

    let created = false;
    if (existing) {
      await prisma.usuarioLocal.update({
        where: { id: existing.id },
        data: { visitedAt: new Date() },
      });
    } else {
      await prisma.usuarioLocal.create({
        data: { usuarioId: userId, localId: Number(localId) },
      });
      created = true;
    }

    return res.status(200).json({ message: 'Visita registrada', visited: true, created });
  } catch (error: any) {
    console.error('Erro ao registrar visita via rota:', error);
    return res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

/**
 * @swagger
 * /api/users/{userId}/visits/{localId}:
 *   get:
 *     summary: Verifica se o usuário logado já visitou um determinado local
 *     tags: [Perfil]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *         description: Precisa ser o mesmo ID do usuário autenticado.
 *       - in: path
 *         name: localId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Resultado da verificação.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 visited: { type: boolean }
 *       400:
 *         description: Parâmetros inválidos.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: O ID na URL não é o do usuário autenticado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/:userId/visits/:localId', async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const localId = Number(req.params.localId);

    if (Number.isNaN(userId) || Number.isNaN(localId)) {
      return res.status(400).json({ message: 'Parâmetros inválidos' });
    }

    // checar usuário autenticado
    const authUser = (req as any).user;
    if (!authUser || authUser.id !== userId) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    const visita = await prisma.usuarioLocal.findFirst({
      where: { usuarioId: userId, localId },
    });

    return res.status(200).json({ visited: !!visita });
  } catch (error: any) {
    console.error('Erro ao verificar visita via rota:', error);
    return res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

export default router;