import path from "path";
import fs from "fs";
import swaggerJSDoc from "swagger-jsdoc";

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "ExploreSaqua API",
    version: "1.0.0",
    description:
      "Documentação da API ExploreSaqua (turismo/comércio local de Saquarema). " +
      "Rotas marcadas com o cadeado exigem um token JWT — use o botão \"Authorize\" " +
      "com o token retornado por /api/auth/login (usuário comum) ou /api/admin/login (admin).",
  },
  servers: [
    {
      url: process.env.APP_URL || `http://localhost:${process.env.PORT || 3005}`,
      description: "Servidor",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      Usuario: {
        type: "object",
        properties: {
          usuarioId: { type: "integer", example: 1 },
          nomeCompleto: { type: "string", example: "Maria da Silva" },
          username: { type: "string", example: "maria.silva" },
          email: { type: "string", format: "email", example: "maria@exemplo.com" },
          enabled: { type: "boolean", example: true },
          progressPercentage: { type: "number", example: 42.5 },
          currentTag: { type: "string", example: "Explorador" },
        },
      },
      ImagemLocal: {
        type: "object",
        properties: {
          id: { type: "integer", example: 10 },
          url: { type: "string", example: "uploads/comercio-e-lojas/meu-local/imagem-123.webp" },
        },
      },
      Local: {
        type: "object",
        properties: {
          localId: { type: "integer", example: 2 },
          nomeLocal: { type: "string", example: "Restaurante do Zé" },
          categoria: { type: "string", example: "comercio-e-lojas" },
          descricao: { type: "string", example: "Comida caseira à beira-mar." },
          endereco: { type: "string", example: "Rua dos Robalos, 119" },
          contatoLocal: { type: "string", example: "22999998888" },
          instagram: { type: "string", example: "restaurantedoze" },
          logoUrl: { type: "string", nullable: true },
          latitude: { type: "number", nullable: true, example: -22.93012 },
          longitude: { type: "number", nullable: true, example: -42.47906 },
          ativo: { type: "boolean", example: true },
          status: {
            type: "string",
            enum: [
              "pendente_aprovacao",
              "ativo",
              "inativo",
              "pendente_atualizacao",
              "pendente_exclusao",
              "rejeitado",
            ],
            example: "ativo",
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          locaisImg: {
            type: "array",
            items: { $ref: "#/components/schemas/ImagemLocal" },
          },
        },
      },
      Avaliacao: {
        type: "object",
        properties: {
          avaliacoesId: { type: "integer", example: 2 },
          comentario: { type: "string", example: "Atendimento ótimo, recomendo!" },
          nota: { type: "number", nullable: true, example: 5, description: "1 a 5. Nulo quando é uma resposta." },
          usuarioId: { type: "integer", nullable: true },
          localId: { type: "integer", nullable: true },
          parentId: { type: "integer", nullable: true, description: "Preenchido quando é uma resposta a outro comentário." },
          usuario: { $ref: "#/components/schemas/Usuario" },
          respostas: {
            type: "array",
            items: { $ref: "#/components/schemas/Avaliacao" },
          },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          message: { type: "string", example: "Mensagem descrevendo o erro." },
        },
      },
    },
    responses: {
      NaoAutorizado: {
        description: "Token ausente, inválido ou expirado.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      NaoEncontrado: {
        description: "Recurso não encontrado.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
    },
  },
};

const options = {
  definition: swaggerDefinition,
  // Procura por anotações JSDoc nas rotas e controllers
  apis: [
    path.resolve(__dirname, "../routes/*.ts"),
    path.resolve(__dirname, "../controllers/*.ts"),
  ],
};

const swaggerSpec = swaggerJSDoc(options) as any;

// Se o developer não adicionou JSDoc, podemos tentar gerar paths básicos a partir das rotas
// para exibir *todas* as APIs na UI. Isso cria operações mínimas (summary, tags, parâmetros de path).
try {
  const routesDir = path.resolve(__dirname, "../routes");
  const files = fs.readdirSync(routesDir).filter((f) => f.endsWith(".ts"));

  // Mapeamento dos arquivos de rota para o prefixo usado em app.ts
  const prefixMap: Record<string, string> = {
    "auth.routes.ts": "/api/auth",
    "local.routes.ts": "/api/locais",
    "avaliacao.routes.ts": "/api/avaliacoes",
    "file.routes.ts": "/api/files",
    "admin.routes.ts": "/api/admin",
    "user.routes.ts": "/api/users",
  };

  swaggerSpec.paths = swaggerSpec.paths || {};

  const methodRegex = /router\.(get|post|put|delete|patch)\s*\(\s*[`'"]([^"'`]+)[`'"]/g;

  files.forEach((file) => {
    const full = path.join(routesDir, file);
    const content = fs.readFileSync(full, "utf8");
    const prefix = prefixMap[file] || "";

    let match;
    while ((match = methodRegex.exec(content)) !== null) {
      const method = match[1].toLowerCase();
      let routePath = match[2];

      // Normaliza '/' duplicados
      if (!routePath.startsWith("/")) routePath = "/" + routePath;

      // Concatena prefix e rota
      let fullPath = (prefix + routePath).replace(/\/\/+/g, "/");

      // Converte :param -> {param} para OpenAPI
      const paramNames: string[] = [];
      fullPath = fullPath.replace(/:([a-zA-Z0-9_]+)/g, (_m, p1) => {
        paramNames.push(p1);
        return `{${p1}}`;
      });

      swaggerSpec.paths[fullPath] = swaggerSpec.paths[fullPath] || {};

      // Se já existir uma operação criada por JSDoc, não sobrescreve
      if (swaggerSpec.paths[fullPath][method]) continue;

      const parameters = paramNames.map((name) => ({
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
      }));

      swaggerSpec.paths[fullPath][method] = {
        tags: [file.replace(".ts", "")],
        summary: `Auto-generated: ${method.toUpperCase()} ${fullPath}`,
        responses: {
          "200": {
            description: "Success",
          },
        },
        parameters: parameters.length ? parameters : undefined,
      };
    }
  });
} catch (err) {
  // se falhar, apenas não adicionamos os paths extras
  console.warn("Swagger auto-route generation failed:", err);
}

export default swaggerSpec;
