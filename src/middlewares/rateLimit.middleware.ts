import rateLimit from "express-rate-limit";

/**
 * Limita tentativas de login a 5 por 15 minutos por IP — dificulta brute-force,
 * especialmente relevante para /api/admin/login (uma única credencial fixa).
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas tentativas de login. Tente novamente em alguns minutos." },
});
