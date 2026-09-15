import { Router } from 'express';
import AuthController from '../controllers/AuthController';

const router = Router();

/**
 * @swagger
 * /api/auth/cadastro:
 *   post:
 *     summary: Cria uma nova conta de usuário
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nomeCompleto, username, email, password]
 *             properties:
 *               nomeCompleto: { type: string, example: "Maria da Silva" }
 *               username: { type: string, example: "maria.silva" }
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       201:
 *         description: Cadastro criado — um e-mail de confirmação foi enviado.
 *       400:
 *         description: Dados inválidos (nome de usuário/e-mail com conteúdo proibido, etc).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: Nome de usuário ou e-mail já cadastrado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/cadastro',
    AuthController.cadastrar
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Autentica um usuário comum e retorna um token JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string, description: "Aceita username OU e-mail." }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Login bem-sucedido.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 user: { $ref: '#/components/schemas/Usuario' }
 *       401:
 *         description: Credenciais inválidas ou conta ainda não confirmada por e-mail.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/login',
    AuthController.login
);

/**
 * @swagger
 * /api/auth/confirm-account:
 *   get:
 *     summary: Confirma a conta a partir do token enviado por e-mail no cadastro
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Conta ativada com sucesso.
 *       400:
 *         description: Token inválido ou não encontrado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/confirm-account',
    AuthController.confirmAccount
);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Solicita o e-mail de redefinição de senha
 *     description: Sempre responde com a mesma mensagem genérica, exista ou não o e-mail informado (evita enumeração de contas).
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Mensagem genérica de confirmação.
 */
router.post('/forgot-password',
    AuthController.forgotPassword
);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Define uma nova senha a partir do token de redefinição
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token: { type: string }
 *               newPassword: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Senha redefinida com sucesso.
 *       400:
 *         description: Token inválido ou expirado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/reset-password',
    AuthController.resetPassword
);

/**
 * @swagger
 * /api/auth/confirm-email-change:
 *   get:
 *     summary: Confirma a troca de e-mail solicitada no perfil do usuário
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: E-mail alterado com sucesso.
 *       400:
 *         description: Token inválido ou não encontrado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/confirm-email-change',
    AuthController.confirmEmailChange
);

export default router;
