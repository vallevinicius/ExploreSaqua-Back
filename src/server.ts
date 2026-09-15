// src/server.ts - VERSÃO CORRIGIDA PARA .env.local

import dotenv from "dotenv";
import path from "path";
import os from "os";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

console.log("Servindo uploads em:", path.resolve(__dirname, "..", "uploads"));
import app from "./app";
import prisma from "./prisma";

const PORT = process.env.PORT || 3306;
const HOST = process.env.HOST || "0.0.0.0";

function getLocalIpAddress(): string | undefined {
  const interfaces = os.networkInterfaces();

  for (const networkInterface of Object.values(interfaces)) {
    if (!networkInterface) continue;

    for (const address of networkInterface) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }

  return undefined;
}

(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("Conexão com a base de dados estabelecida com sucesso (Prisma).");

    app.listen(Number(PORT), HOST, () => {
      const localIp = getLocalIpAddress();
      const docsUrl = `http://localhost:${PORT}/docs`;
      const networkUrl = localIp ? `http://${localIp}:${PORT}` : `http://<seu-ip-local>:${PORT}`;
      const networkDocsUrl = localIp ? `http://${localIp}:${PORT}/docs` : `http://<seu-ip-local>:${PORT}/docs`;
      console.log(`🚀 Servidor a rodar na porta ${PORT}`);
      console.log(`✅ A sua API está pronta! Pode aceder em http://localhost:${PORT}`);
      console.log(`🌐 Link para enviar: ${networkUrl}`);
      console.log(`📘 Swagger na rede local: ${networkDocsUrl}`);
      console.log(`📘 Swagger UI: ${docsUrl} `);
    });
  } catch (err) {
    console.error("❌ Não foi possível conectar à base de dados:", err);
    process.exit(1);
  }
})();
