import express from "express";
import cors from "cors";
import path from "path";
// O dotenv já é carregado no server.ts, mas não faz mal garantir aqui também,
// desde que aponte para o lugar certo (mesma pasta).
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env") });

import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import avaliacaoRoutes from "./routes/avaliacao.routes";
import localRoutes from "./routes/local.routes";
import fileRoutes from "./routes/file.routes";
import adminRoutes from "./routes/admin.routes";
import { authMiddleware, authOrAdminMiddleware } from "./middlewares/auth.middleware";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./config/swagger";
import progressRoutes from './routes/progress.routes';

const app = express();

// Ajuste para pegar a pasta uploads na raiz do projeto
const uploadsPath = path.resolve(__dirname, "..",  "uploads");

// Restringe o CORS às origens do frontend (FRONTEND_URL aceita uma lista separada por vírgula).
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:3308")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve os arquivos estáticos (imagens)
app.use("/uploads", express.static(uploadsPath));

// Swagger UI
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Rotas
app.use("/api/auth", authRoutes);
app.use("/api/locais", localRoutes);
app.use("/api/avaliacoes", avaliacaoRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/admin", adminRoutes);

// Rotas protegidas
app.use("/api/users", authOrAdminMiddleware, userRoutes);
app.use('/api/users', authMiddleware, progressRoutes);

export default app;
