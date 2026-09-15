import { Request, Response, type NextFunction } from "express";
import * as jwt from "jsonwebtoken";
import fs from "fs/promises";
import path from "path";
import prisma from "../prisma";
import { StatusLocal, Prisma } from "@prisma/client";
import EmailService from "../utils/EmailService";
import LocalService from "../services/LocalService";
import adminService from "../services/AdminService";
import AuthService from "../services/AuthService";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

// Usado para diferenciar "não encontrado" (404) de outras falhas dentro de uma
// transação Prisma, já que o Prisma não tem um rollback "manual" como o Sequelize.
class NotFoundError extends Error {}

// Campos de Local que o admin pode editar via formulário (whitelist). O Prisma,
// diferente do Sequelize, rejeita com erro qualquer chave desconhecida em `data`,
// então não dá para espalhar `req.body` inteiro como antes.
const LOCAL_EDITABLE_FIELDS = [
  "logoUrl",
  "emailResponsavel",
  "contatoResponsavel",
  "alvaraFuncionamentoUrl",
  "alvaraVigilanciaUrl",
  "categoria",
  "nomeResponsavel",
  "cpfResponsavel",
  "contatoLocal",
  "nomeLocal",
  "endereco",
  "descricao",
  "instagram",
  "latitude",
  "longitude",
  "tipoCadastro",
  "indicadorNome",
  "indicadorContato",
  "indicadorEmail",
] as const;

function pickLocalEditableFields(data: Record<string, any>): Record<string, any> {
  const picked: Record<string, any> = {};
  for (const key of LOCAL_EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      picked[key] = data[key];
    }
  }
  return picked;
}

export const aprovarAtualizacao = async (req: Request, res: Response) => {
    const { id } = req.params;
    const local = await adminService.aprovarAtualizacao(Number(id));
    res.json(local);
}

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.ADMIN_JWT_SECRET;

if (!ADMIN_USER || !ADMIN_PASSWORD || !JWT_SECRET) {
  console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  console.error("ERRO CRÍTICO: Variáveis de ambiente do Admin não definidas.");
  console.error(
    "Por favor, defina ADMIN_USER, ADMIN_PASSWORD, e ADMIN_JWT_SECRET"
  );
  console.error(
    "no seu ficheiro .env (ou .env.local) antes de iniciar o servidor."
  );
  console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  throw new Error(
    "Credenciais de administrador ou segredo JWT não configurados."
  );
}

export class AdminController {
  // Permite que o admin exclua definitivamente um local (usando AdminService)
  static async deleteLocal(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await adminService.aprovarExclusao(Number(id));
      return res.status(200).json({ message: "Local excluído com sucesso." });
    } catch (error: any) {
      console.error("Erro ao excluir local (admin):", error);
      return res.status(500).json({ message: error.message || "Erro ao excluir local." });
    }
  }

  // Rota usada pelo painel Admin para ativar/desativar um local (fica invisível ao público quando desativado)
  static async toggleLocalAtivo(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Tentamos extrair 'ativo' do body primeiro, depois da query string.
      let ativoParam: any = undefined;
      if (req.body && typeof req.body === 'object' && Object.prototype.hasOwnProperty.call(req.body, 'ativo')) {
        ativoParam = (req.body as any).ativo;
      }

      if (typeof ativoParam === 'undefined' && typeof req.query !== 'undefined') {
        const q = (req.query as any).ativo;
        if (typeof q !== 'undefined') {
          if (q === 'true' || q === '1' || q === 1 || q === true) ativoParam = true;
          else if (q === 'false' || q === '0' || q === 0 || q === false) ativoParam = false;
        }
      }

      // Determina o valor final: se foi passado, usa; senão, inverte o atual.
      let finalAtivo: boolean;
      if (typeof ativoParam === 'boolean') {
        finalAtivo = ativoParam;
      } else {
        const localAtual = await prisma.local.findUnique({ where: { localId: Number(id) } });
        if (!localAtual) return res.status(404).json({ message: 'Local não encontrado.' });
        const atual = !!localAtual.ativo;
        finalAtivo = !atual;
      }

      const local = await LocalService.alterarStatusAtivo(Number(id), finalAtivo);

      // Para compatibilidade com o frontend, mapeamos o status para 'ativo' ou 'inativo'
      const statusString = local.status === StatusLocal.ativo ? 'ativo' : 'inativo';

      // RETORNO: preferimos enviar somente a string de status para que o frontend a leia
      return res.status(200).json({ status: statusString, local });
    } catch (error: any) {
      console.error("Erro ao alterar status de ativo pelo Admin:", error);
      return res.status(500).json({ message: error.message || "Erro interno." });
    }
  }
  static async login(req: Request, res: Response) {
    const { username, password } = req.body;

    if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
      const token = jwt.sign(
        { username, role: "admin" },
        JWT_SECRET as string,
        {
          expiresIn: "8h",
        }
      );
      return res.json({ success: true, token });
    }

    return res
      .status(401)
      .json({ success: false, message: "Credenciais inválidas" });
  }

  static async getPending(req: Request, res: Response) {
    try {
      const includeImagens = { locaisImg: { select: { url: true } } } as const;

      const cadastros = await prisma.local.findMany({
        where: { status: StatusLocal.pendente_aprovacao },
        include: includeImagens,
      });
      const atualizacoes = await prisma.local.findMany({
        where: { status: StatusLocal.pendente_atualizacao },
        include: includeImagens,
      });
      const exclusoes = await prisma.local.findMany({
        where: { status: StatusLocal.pendente_exclusao },
        include: includeImagens,
      });

      // Novidade: indicações (cadastros do tipo 'indication')
      const indicacoes = await prisma.local.findMany({
        where: { tipoCadastro: "indication" },
        include: includeImagens,
      });

      // Função utilitária para deduplicar imagens por URL
      const dedupeByUrl = (imgs: Array<{ url: string | null }> | undefined) => {
        if (!imgs || !Array.isArray(imgs)) return [];
        const seen = new Set<string>();
        const unique: Array<{ url: string | null }> = [];
        for (const im of imgs) {
          if (!im || !im.url) continue;
          if (!seen.has(im.url)) {
            seen.add(im.url);
            unique.push(im);
          }
        }
        return unique;
      };

      // NOVIDADE: Adiciona as URLs de imagens que vêm do "dadosAtualizacao"
      // para que a aba "Atualizações" também mostre o portfólio novo.
      const formatarAtualizacoes = atualizacoes.map(local => {
        const localData: any = { ...local };
        // Se o pedido de atualização trouxe novas imagens, use-as (substitui o include)
        if (localData.dadosAtualizacao && localData.dadosAtualizacao.imagens) {
           localData.locaisImg = localData.dadosAtualizacao.imagens.map((url: string) => ({ url }));
        }
        // Caso contrário, dedupe as imagens trazidas pelo include
        localData.locaisImg = dedupeByUrl(localData.locaisImg);
        return localData;
      });

      // Deduplica imagens em cadastros e exclusoes também
      const formatarLista = (lista: any[]) => lista.map((local: any) => {
        const localData: any = { ...local };
        localData.locaisImg = dedupeByUrl(localData.locaisImg);
        return localData;
      });

      const cadastrosFormatados = formatarLista(cadastros);
      const exclusoesFormatadas = formatarLista(exclusoes);
      const indicacoesFormatadas = formatarLista(indicacoes);

      return res.json({ cadastros: cadastrosFormatados, atualizacoes: formatarAtualizacoes, exclusoes: exclusoesFormatadas, indicacoes: indicacoesFormatadas });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Erro ao buscar solicitações pendentes." });
    }
  }

  static async approveRequest(req: Request, res: Response) {
    const { id } = req.params;

    let responseMessage = "Solicitação aprovada com sucesso.";
    let emailInfo: { subject: string; html: string } | null = null;

    try {
      const localResult = await prisma.$transaction(async (tx) => {
        const local = await tx.local.findUnique({
          where: { localId: Number(id) },
          include: { locaisImg: true },
        });

        if (!local) {
          throw new NotFoundError("local não encontrado.");
        }

        switch (local.status) {
          case StatusLocal.pendente_aprovacao: {
            const updated = await tx.local.update({
              where: { localId: local.localId },
              data: { status: StatusLocal.ativo, ativo: true },
            });

            emailInfo = {
              subject: "Seu cadastro no MeideSaquá foi Aprovado!",
              html: `
                <h1>Olá, ${updated.nomeResponsavel}!</h1>
                <p>Temos uma ótima notícia: o seu local, <strong>${updated.nomeLocal}</strong>, foi aprovado e já está visível na nossa plataforma!</p>
                <p>A partir de agora, clientes podem encontrar o seu negócio e deixar avaliações.</p>
                <p>Agradecemos por fazer parte da comunidade de empreendedores de Saquarema.</p>
                <br>
                <p>Atenciosamente,</p>
                <p><strong>Equipe MeideSaquá.</strong></p>
              `,
            };
            return updated;
          }

          case StatusLocal.pendente_atualizacao: {
            if (local.dadosAtualizacao) {
              const dadosRecebidos = local.dadosAtualizacao as any;
              const dadosParaAtualizar: Record<string, any> = {};

              const camposPermitidos = [
                "categoria",
                "contatoLocal",
                "nomeLocal",
                "endereco",
                "descricao",
                "instagram",
                "nomeResponsavel",
                "cpfResponsavel",
                "latitude",
                "longitude",
              ];

              for (const key of camposPermitidos) {
                if (
                  Object.prototype.hasOwnProperty.call(dadosRecebidos, key) &&
                  dadosRecebidos[key] != null
                ) {
                  dadosParaAtualizar[key] = dadosRecebidos[key];
                }
              }

              const logoRecebida = dadosRecebidos.logoUrl || dadosRecebidos.logo;

              // --- LÓGICA DA LOGO RESTAURADA ---
              if (logoRecebida) {
                const logoAntigaUrl = local.logoUrl;
                if (logoAntigaUrl) {
                  try {
                    const filePath = path.join(
                      __dirname,
                      "..",
                      "..",
                      logoAntigaUrl
                    );
                    await fs.unlink(filePath);
                  } catch (err) {
                    console.error(
                      `AVISO: Falha ao deletar logo antiga: ${logoAntigaUrl}`,
                      err
                    );
                  }
                }
                dadosParaAtualizar.logoUrl = logoRecebida;
              }
              // --- FIM LOGICA LOGO ---

              const imagensRecebidas = Array.isArray(dadosRecebidos.imagens)
                ? dadosRecebidos.imagens
                : Array.isArray(dadosRecebidos.produtos)
                  ? dadosRecebidos.produtos
                  : [];

              // Lógica de imagens (Produtos/Portfólio) mantida
              if (
                Array.isArray(imagensRecebidas) &&
                imagensRecebidas.length > 0
              ) {
                const imagensAntigas = await tx.imagemLocal.findMany({
                  where: { localId: local.localId },
                });

                for (const imagem of imagensAntigas) {
                  try {
                    if (imagem.url) {
                      const filePath = path.join(__dirname, "..", "..", imagem.url);
                      await fs.unlink(filePath);
                    }
                  } catch (err) {
                    console.error(
                      `AVISO: Falha ao deletar imagem antiga: ${imagem.url}`,
                      err
                    );
                  }
                }

                await tx.imagemLocal.deleteMany({
                  where: { localId: local.localId },
                });

                await tx.imagemLocal.createMany({
                  data: imagensRecebidas.map((url: string) => ({
                    url,
                    localId: local.localId,
                  })),
                });
              }

              dadosParaAtualizar.dadosAtualizacao = Prisma.DbNull;
              dadosParaAtualizar.status = StatusLocal.ativo;
              dadosParaAtualizar.ativo = true;

              const updated = await tx.local.update({
                where: { localId: local.localId },
                data: dadosParaAtualizar,
              });

              emailInfo = {
                subject:
                  "Sua solicitação de atualização no MeideSaquá foi Aprovada!",
                html: `
                  <h1>Olá, ${updated.nomeResponsavel}!</h1>
                  <p>A sua solicitação para atualizar os dados do local <strong>${updated.nomeLocal}</strong> foi aprovada.</p>
                  <p>As novas informações já estão visíveis para todos na plataforma.</p>
                  <br>
                  <p>Atenciosamente,</p>
                  <p><strong>Equipe MeideSaquá</strong></p>
                `,
              };
              return updated;
            } else {
              const updated = await tx.local.update({
                where: { localId: local.localId },
                data: {
                  dadosAtualizacao: Prisma.DbNull,
                  status: StatusLocal.ativo,
                  ativo: true,
                },
              });

              emailInfo = {
                subject:
                  "Sua solicitação de atualização no MeideSaquá foi Aprovada!",
                html: `
                  <h1>Olá, ${updated.nomeResponsavel}!</h1>
                  <p>A sua solicitação para atualizar os dados do local <strong>${updated.nomeLocal}</strong> foi aprovada.</p>
                  <p>As novas informações já estão visíveis para todos na plataforma.</p>
                  <br>
                  <p>Atenciosamente,</p>
                  <p><strong>Equipe MeideSaquá</strong></p>
                `,
              };
              return updated;
            }
          }

          case StatusLocal.pendente_exclusao: {
            // Deleta arquivos associados (logo + imagens) antes de remover o local
            try {
              // função para sanitizar nome de pasta (mesma lógica usada no upload)
              const sanitize = (name: string) => (name || "").replace(/[^a-z0-9]/gi, "_").toLowerCase();

              // Deleta logo se existir
              const logoUrl = local.logoUrl;
              if (logoUrl) {
                try {
                  const filePath = path.join(__dirname, "..", "..", logoUrl);
                  await fs.unlink(filePath);
                  console.log(`Logo deletada: ${logoUrl}`);
                } catch (err) {
                  console.warn(`Falha ao deletar logo: ${logoUrl}`, err);
                }
              }

              // Deleta todas as imagens registradas em ImagemLocal
              const imagensAntigas = await tx.imagemLocal.findMany({ where: { localId: local.localId } });
              for (const imagem of imagensAntigas) {
                try {
                  if (imagem.url) {
                    const filePath = path.join(__dirname, "..", "..", imagem.url);
                    await fs.unlink(filePath);
                    console.log(`Imagem deletada: ${imagem.url}`);
                  }
                } catch (err) {
                  console.warn(`Falha ao deletar imagem: ${imagem.url}`, err);
                }
              }

              // Remove registros de imagens no banco
              await tx.imagemLocal.deleteMany({ where: { localId: local.localId } });

              // Remove pasta de uploads do local (se existir)
              try {
                const pasta = path.join(
                  __dirname,
                  "..",
                  "..",
                  "uploads",
                  sanitize(local.categoria || "geral"),
                  sanitize(local.nomeLocal || `local_${local.localId}`)
                );
                await fs.rm(pasta, { recursive: true, force: true });
                console.log(`Pasta de uploads deletada: ${pasta}`);
              } catch (err) {
                console.warn("Falha ao deletar pasta de uploads:", err);
              }
            } catch (err) {
              console.error("Erro ao limpar arquivos antes de excluir local:", err);
            }

            emailInfo = {
              subject: "Seu local foi removido da plataforma MeideSaquá",
              html: `
                <h1>Olá, ${local.nomeResponsavel}.</h1>
                <p>Informamos que a sua solicitação para remover o local <strong>${local.nomeLocal}</strong> da nossa plataforma foi concluída com sucesso.</p>
                <p>Lamentamos a sua partida e esperamos poder colaborar com você novamente no futuro.</p>
                <br>
                <p>Atenciosamente,</p>
                <p><strong>Equipe MeideSaquá</strong></p>
              `,
            };
            await tx.local.delete({ where: { localId: local.localId } });
            responseMessage = "local excluído com sucesso.";
            return local;
          }

          default:
            return local;
        }
      });

      if (emailInfo && localResult.contatoLocal) {
        try {
          await EmailService.sendGenericEmail({
            to: localResult.contatoLocal,
            subject: (emailInfo as { subject: string; html: string }).subject,
            html: (emailInfo as { subject: string; html: string }).html,
          });
          console.log(
            `Email de notificação enviado com sucesso para ${localResult.contatoLocal}`
          );
        } catch (error) {
          console.error(
            `Falha ao enviar email de notificação para ${localResult.contatoLocal}:`,
            error
          );
        }
      } else if (emailInfo) {
        console.warn(
          `Tentativa de enviar email para local ID ${localResult.localId} sem contatoLocal definido.`
        );
      }

      return res.status(200).json({ message: responseMessage });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      console.error("ERRO DURANTE A APROVAÇÃO:", error);
      return res
        .status(500)
        .json({ message: "Erro ao aprovar a solicitação." });
    }
  }

  static async editAndApproveRequest(req: Request, res: Response) {
    const { id } = req.params;
    const adminEditedData = req.body;

    let { urlsParaExcluir } = adminEditedData;
    if (urlsParaExcluir && typeof urlsParaExcluir === "string") {
      try {
        urlsParaExcluir = JSON.parse(urlsParaExcluir);
      } catch (e) {
        console.error(
          "Falha ao parsear urlsParaExcluir em editAndApproveRequest:",
          e
        );
        urlsParaExcluir = [];
      }
    }

    let emailInfo: { subject: string; html: string } | null = null;

    try {
      const updatedLocal = await prisma.$transaction(async (tx) => {
        const local = await tx.local.findUnique({
          where: { localId: Number(id) },
          include: { locaisImg: true },
        });

        if (!local) {
          throw new NotFoundError("Local não encontrado.");
        }

        const statusOriginal = local.status;
        const dadosRecebidos = (local.dadosAtualizacao || {}) as any;

        if (
          statusOriginal === StatusLocal.pendente_atualizacao &&
          local.dadosAtualizacao
        ) {
          const logoRecebida = dadosRecebidos.logoUrl || dadosRecebidos.logo;
          const imagensRecebidas = Array.isArray(dadosRecebidos.imagens)
            ? dadosRecebidos.imagens
            : Array.isArray(dadosRecebidos.produtos)
              ? dadosRecebidos.produtos
              : [];

          // --- LÓGICA DA LOGO RESTAURADA ---
          if (
            "logoUrl" in adminEditedData &&
            adminEditedData.logoUrl === "DELETE"
          ) {
            const logoAntigaUrl = local.logoUrl || dadosRecebidos.logo;
            if (logoAntigaUrl) {
              try {
                const filePath = path.join(__dirname, "..", "..", logoAntigaUrl);
                await fs.unlink(filePath);
              } catch (err) {
                console.error(
                  `AVISO: Falha ao deletar logo: ${logoAntigaUrl}`,
                  err
                );
              }
            }
            adminEditedData.logoUrl = null;
          } else if (logoRecebida) {
            const logoAntigaUrl = local.logoUrl;
            if (logoAntigaUrl) {
              try {
                const filePath = path.join(__dirname, "..", "..", logoAntigaUrl);
                await fs.unlink(filePath);
              } catch (err) {
                console.error(
                  `AVISO: Falha ao deletar logo antiga: ${logoAntigaUrl}`,
                  err
                );
              }
            }
            adminEditedData.logoUrl = logoRecebida;
          }
          // --- FIM LÓGICA LOGO ---

          // Lógica para IMAGENS
          if (
            Array.isArray(imagensRecebidas) &&
            imagensRecebidas.length > 0
          ) {
            const imagensAntigas = await tx.imagemLocal.findMany({
              where: { localId: local.localId },
            });

            for (const imagem of imagensAntigas) {
              try {
                if (imagem.url) {
                  const filePath = path.join(__dirname, "..", "..", imagem.url);
                  await fs.unlink(filePath);
                }
              } catch (err) {
                // ignora
              }
            }

            await tx.imagemLocal.deleteMany({
              where: { localId: local.localId },
            });

            const imagensParaCriar = imagensRecebidas.filter(
              (url: string) => !(urlsParaExcluir && urlsParaExcluir.includes(url))
            );

            await tx.imagemLocal.createMany({
              data: imagensParaCriar.map((url: string) => ({
                url,
                localId: local.localId,
              })),
            });
          } else if (
            urlsParaExcluir &&
            Array.isArray(urlsParaExcluir) &&
            urlsParaExcluir.length > 0
          ) {
            const imagensParaDeletar = await tx.imagemLocal.findMany({
              where: {
                url: { in: urlsParaExcluir },
                localId: local.localId,
              },
            });

            for (const imagem of imagensParaDeletar) {
              try {
                if (imagem.url) {
                  const filePath = path.join(__dirname, "..", "..", imagem.url);
                  await fs.unlink(filePath);
                }
              } catch (err) {
                // ignora
              }
            }

            await tx.imagemLocal.deleteMany({
              where: {
                id: { in: imagensParaDeletar.map((img) => img.id) },
              },
            });
          }
        }

        delete adminEditedData.urlsParaExcluir;

        const updated = await tx.local.update({
          where: { localId: local.localId },
          data: {
            ...pickLocalEditableFields(adminEditedData),
            status: StatusLocal.ativo,
            ativo: true,
            dadosAtualizacao: Prisma.DbNull,
          },
        });

        if (statusOriginal === StatusLocal.pendente_aprovacao) {
          emailInfo = {
            subject: "Seu cadastro no MeideSaquá foi Aprovado!",
            html: `<h1>Olá, ${updated.nomeResponsavel}!</h1> <p>Temos uma ótima notícia: o seu local, <strong>${updated.nomeLocal}</strong>, foi aprovado (com algumas edições do administrador) e já está visível na nossa plataforma!</p><p>Agradecemos por fazer parte da comunidade de empreendedores de Saquarema.</p><br><p>Atenciosamente,</p><p><strong>Equipe MeideSaquá.</strong></p>`,
          };
        } else if (
          statusOriginal === StatusLocal.pendente_atualizacao
        ) {
          emailInfo = {
            subject: "Sua solicitação de atualização no MeideSaquá foi Aprovada!",
            html: `<h1>Olá, ${updated.nomeResponsavel}!</h1><p>A sua solicitação para atualizar os dados do local <strong>${updated.nomeLocal}</strong> foi aprovada (com algumas edições do administrador).</p><p>As novas informações já estão visíveis para todos na plataforma.</p><br><p>Atenciosamente,</p><p><strong>Equipe MeideSaquá</strong></p>`,
          };
        }

        return updated;
      });

      if (emailInfo && updatedLocal.contatoLocal) {
        try {
          await EmailService.sendGenericEmail({
            to: updatedLocal.contatoLocal,
            subject: (emailInfo as { subject: string; html: string }).subject,
            html: (emailInfo as { subject: string; html: string }).html,
          });
        } catch (error) {
          console.error(
            `Falha ao enviar email de notificação para ${updatedLocal.contatoLocal}:`,
            error
          );
        }
      }

      return res
        .status(200)
        .json({ message: "Local editado e aprovado com sucesso." });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      console.error("ERRO DURANTE A EDIÇÃO E APROVAÇÃO:", error);
      return res
        .status(500)
        .json({ message: "Erro ao editar e aprovar a solicitação." });
    }
  }

  static async getAllActiveLocal(req: Request, res: Response) {
    try {
      const local = await LocalService.listarTodos();
      return res.json(local);
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Erro ao buscar local ativos." });
    }
  }

  static async adminUpdateLocal(req: Request, res: Response) {
    const { id } = req.params;
    const adminEditedData = req.body;

    let { urlsParaExcluir } = adminEditedData;
    if (urlsParaExcluir && typeof urlsParaExcluir === "string") {
      try {
        urlsParaExcluir = JSON.parse(urlsParaExcluir);
      } catch (e) {
        console.error(
          "Falha ao parsear urlsParaExcluir em adminUpdateLocal:",
          e
        );
        urlsParaExcluir = [];
      }
    }

    let emailInfo: { subject: string; html: string } | null = null;

    try {
      const updatedLocal = await prisma.$transaction(async (tx) => {
        const local = await tx.local.findUnique({
          where: { localId: Number(id) },
          include: { locaisImg: true },
        });

        if (!local) {
          throw new NotFoundError("Local não encontrado.");
        }

        const statusOriginal = local.status;
        const dadosRecebidos = (local.dadosAtualizacao || {}) as any;
        const logoRecebida = dadosRecebidos.logoUrl || dadosRecebidos.logo;
        const imagensRecebidas = Array.isArray(dadosRecebidos.imagens)
          ? dadosRecebidos.imagens
          : Array.isArray(dadosRecebidos.produtos)
            ? dadosRecebidos.produtos
            : [];

        // --- LÓGICA DA LOGO RESTAURADA ---
        if (
          "logoUrl" in adminEditedData &&
          (adminEditedData.logoUrl === "DELETE" ||
            adminEditedData.logoUrl === null)
        ) {
          const logoAntigaUrl = local.logoUrl || dadosRecebidos.logo;
          if (logoAntigaUrl) {
            try {
              const filePath = path.join(__dirname, "..", "..", logoAntigaUrl);
              await fs.unlink(filePath);
              console.log(`Logo deletada: ${logoAntigaUrl}`);
            } catch (err) {
              console.error(
                `AVISO: Falha ao deletar logo: ${logoAntigaUrl}`,
                err
              );
            }
          }
          adminEditedData.logoUrl = null;
        } else if (
          (statusOriginal === StatusLocal.pendente_atualizacao ||
            statusOriginal === StatusLocal.pendente_aprovacao) &&
          logoRecebida
        ) {
          const logoAntigaUrl = local.logoUrl;
          if (logoAntigaUrl) {
            try {
              const filePath = path.join(__dirname, "..", "..", logoAntigaUrl);
              await fs.unlink(filePath);
            } catch (err) {
              console.error(
                `AVISO: Falha ao deletar logo antiga: ${logoAntigaUrl}`,
                err
              );
            }
          }
          adminEditedData.logoUrl = logoRecebida;
        }
        // --- FIM LÓGICA LOGO ---

        // 1. LÓGICA DE IMAGENS DO PORTFÓLIO
        if (
          (statusOriginal === StatusLocal.pendente_atualizacao ||
            statusOriginal === StatusLocal.pendente_aprovacao) &&
          Array.isArray(imagensRecebidas) &&
          imagensRecebidas.length > 0
        ) {
          const imagensAntigas = await tx.imagemLocal.findMany({
            where: { localId: local.localId },
          });

          for (const imagem of imagensAntigas) {
            try {
              if (imagem.url) {
                const filePath = path.join(__dirname, "..", "..", imagem.url);
                await fs.unlink(filePath);
              }
            } catch (err) {
              // ignora
            }
          }

          await tx.imagemLocal.deleteMany({
            where: { localId: local.localId },
          });

          const imagensParaCriar = imagensRecebidas.filter(
            (url: string) => !(urlsParaExcluir && urlsParaExcluir.includes(url))
          );

          await tx.imagemLocal.createMany({
            data: imagensParaCriar.map((url: string) => ({
              url,
              localId: local.localId,
            })),
          });
        } else if (
          urlsParaExcluir &&
          Array.isArray(urlsParaExcluir) &&
          urlsParaExcluir.length > 0
        ) {
          const imagensParaDeletar = await tx.imagemLocal.findMany({
            where: {
              url: { in: urlsParaExcluir },
              localId: local.localId,
            },
          });

          for (const imagem of imagensParaDeletar) {
            try {
              if (imagem.url) {
                const filePath = path.join(__dirname, "..", "..", imagem.url);
                await fs.unlink(filePath);
              }
            } catch (err) {
              // ignora
            }
          }

          await tx.imagemLocal.deleteMany({
            where: {
              id: { in: imagensParaDeletar.map((img) => img.id) },
            },
          });
        }

        delete adminEditedData.urlsParaExcluir;

        const updated = await tx.local.update({
          where: { localId: local.localId },
          data: {
            ...pickLocalEditableFields(adminEditedData),
            status: StatusLocal.ativo,
            ativo: true,
            dadosAtualizacao: Prisma.DbNull,
          },
        });

        if (statusOriginal === StatusLocal.pendente_aprovacao) {
          emailInfo = {
            subject: "Seu cadastro no MeideSaquá foi Aprovado!",
            html: `<h1>Olá, ${updated.nomeResponsavel}!</h1> <p>Temos uma ótima notícia: o seu local, <strong>${updated.nomeLocal}</strong>, foi aprovado (com algumas edições do administrador) e já está visível na nossa plataforma!</p><p>Agradecemos por fazer parte da comunidade de empreendedores de Saquarema.</p><br><p>Atenciosamente,</p><p><strong>Equipe MeideSaquá.</strong></p>`,
          };
        } else if (
          statusOriginal === StatusLocal.pendente_atualizacao
        ) {
          emailInfo = {
            subject: "Sua solicitação de atualização no MeideSaquá foi Aprovada!",
            html: `<h1>Olá, ${updated.nomeResponsavel}!</h1><p>A sua solicitação para atualizar os dados do local <strong>${updated.nomeLocal}</strong> foi aprovada (com algumas edições do administrador).</p><p>As novas informações já estão visíveis para todos na plataforma.</p><br><p>Atenciosamente,</p><p><strong>Equipe MeideSaquá</strong></p>`,
          };
        }

        return updated;
      });

      if (emailInfo && updatedLocal.contatoLocal) {
        try {
          await EmailService.sendGenericEmail({
            to: updatedLocal.contatoLocal,
            subject: (emailInfo as { subject: string; html: string }).subject,
            html: (emailInfo as { subject: string; html: string }).html,
          });
        } catch (error) {
          console.error(
            `Falha ao enviar email de notificação para ${updatedLocal.contatoLocal}:`,
            error
          );
        }
      }

      return res
        .status(200)
        .json({ message: "Local editado e aprovado com sucesso." });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      console.error("ERRO DURANTE A EDIÇÃO E APROVAÇÃO:", error);
      return res
        .status(500)
        .json({ message: "Erro ao editar e aprovar a solicitação." });
    }
  }

  static async getAvaliacoesByLocal(req: Request, res: Response) {
    try {
      const { localId } = req.params;
      const localIdNum = Number(localId);

      const local = await prisma.local.findUnique({
        where: { localId: localIdNum },
        select: { localId: true, nomeLocal: true, categoria: true },
      });

      if (!local) {
        return res
          .status(404)
          .json({ message: "Local não encontrado." });
      }

      const avaliacoes = await prisma.avaliacao.findMany({
        where: { localId: localIdNum, parentId: null },
        include: {
          usuario: {
            select: { usuarioId: true, nomeCompleto: true, email: true },
          },
          respostas: {
            include: {
              usuario: {
                select: { usuarioId: true, nomeCompleto: true, email: true },
              },
            },
            orderBy: { avaliacoesId: "asc" },
          },
        },
        orderBy: { avaliacoesId: "desc" },
      });

      return res.json({ local, avaliacoes });
    } catch (error) {
      console.error(
        "Erro ao buscar avaliações por local (admin):",
        error
      );
      return res.status(500).json({ message: "Erro ao buscar avaliações." });
    }
  }

  static async adminDeleteAvaliacao(req: Request, res: Response) {
    const { id } = req.params;

    try {
      const avaliacao = await prisma.avaliacao.findUnique({ where: { avaliacoesId: Number(id) } });

      if (!avaliacao) {
        return res.status(404).json({ message: "Avaliação não encontrada." });
      }

      await prisma.avaliacao.delete({ where: { avaliacoesId: Number(id) } });

      return res
        .status(200)
        .json({ message: "Avaliação excluída com sucesso." });
    } catch (error) {
      console.error("Erro ao excluir avaliação (admin):", error);
      return res.status(500).json({ message: "Erro ao excluir a avaliação." });
    }
  }

  static async exportActiveLocals(req: Request, res: Response) {
    try {
      const Locals = await LocalService.listarTodos();

      if (!Locals || Locals.length === 0) {
        return res
          .status(404)
          .json({ message: "Nenhum local ativo para exportar." });
      }

      // Cabeçalhos do CSV atualizados com os novos dados
      const headers = [
        "ID",
        "Nome Local",
        "Categoria",
        "Responsável",
        "CPF Responsável",
        "Contato",
        "Endereço",
        "Descrição",
        "Instagram",
        "Latitude",
        "Longitude",
        "Status",
      ];

      const SEPARATOR = ";";

      const escapeCsvField = (field: any) => {
        if (field === null || field === undefined) return '""';
        const stringField = String(field);
        if (
          stringField.includes('"') ||
          stringField.includes(SEPARATOR) ||
          stringField.includes("\n")
        ) {
          return `"${stringField.replace(/"/g, '""')}"`;
        }
        return `"${stringField}"`;
      };

      let csvContent = headers.join(SEPARATOR) + "\n";

      Locals.forEach((est) => {
        const row = [
          est.localId,
          est.nomeLocal,
          est.categoria,
          est.nomeResponsavel,
          est.cpfResponsavel,
          est.contatoLocal,
          est.endereco,
          est.descricao,
          est.instagram,
          est.latitude,
          est.longitude,
          est.status,
        ];

        csvContent += row.map(escapeCsvField).join(SEPARATOR) + "\n";
      });

      res.header("Content-Type", "text/csv; charset=utf-8");
      res.attachment("Locals_ativos_meidesaqua.csv");
      return res.status(200).send(csvContent);
    } catch (error) {
      console.error("Erro ao exportar Locals:", error);
      return res
        .status(500)
        .json({ message: "Erro ao gerar arquivo de exportação." });
    }
  }

  static async getDashboardStats(req: Request, res: Response) {
    try {
      // Atualizando para não buscar os campos escala e venda (que foram excluídos)
      const Locais = await prisma.local.findMany({
        where: { status: StatusLocal.ativo },
        select: { localId: true, categoria: true },
      });

      const totalLocais = Locais.length;

      const avaliacoes = await prisma.avaliacao.findMany({
        where: { parentId: null },
        select: { nota: true },
      });

      const totalAvaliacoes = avaliacoes.length;
      let somaNotas = 0;
      const distribuicaoNotas = [0, 0, 0, 0, 0];

      avaliacoes.forEach((a) => {
        if (a.nota) {
          somaNotas += a.nota;
          const notaIndex = Math.floor(a.nota) - 1;
          if (notaIndex >= 0 && notaIndex < 5) {
            distribuicaoNotas[notaIndex]++;
          }
        }
      });

      const mediaAvaliacao =
        totalAvaliacoes > 0 ? (somaNotas / totalAvaliacoes).toFixed(1) : 0;

      const chartDistribuicaoNotas = distribuicaoNotas.map((qtd, index) => ({
        nota: `${index + 1} Estrela${index !== 0 ? "s" : ""}`,
        qtd: qtd,
      }));

      const categoriasMap: { [key: string]: number } = {};

      Locais.forEach((e) => {
        if (e.categoria) {
          const catNome = e.categoria.charAt(0).toUpperCase() + e.categoria.slice(1).toLowerCase();
          categoriasMap[catNome] = (categoriasMap[catNome] || 0) + 1;
        }
      });

      const chartLocaisPorCategoria = Object.entries(categoriasMap)
        .map(([categoria, qtd]) => ({ categoria, qtd }))
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 10);

      const totalUsuarios = await prisma.usuario.count();
      const visualizacoesRaw = await prisma.contadorVisualizacao.findMany();

      const pageViews = { home: 0, espacoExplore: 0, categoriasTotal: 0 };
      const mapaVisualizacoes: { [key: string]: number } = {};
      const mapaCursos: { [key: string]: number } = {};

      const espacoExploreClicks = { gov: 0, wpp: 0, email: 0 };
      let perfilCompartilhado = 0;

      visualizacoesRaw.forEach((v) => {
        if (v.identificador === "HOME") {
          pageViews.home = v.visualizacoes;
        } else if (v.identificador === "ESPACO_MEI") {
          pageViews.espacoExplore = v.visualizacoes;
        } else if (v.identificador.startsWith("CAT_")) {
          let nomeCat = v.identificador.replace("CAT_", "").replace(/_/g, " ").toLowerCase();
          nomeCat = nomeCat.charAt(0).toUpperCase() + nomeCat.slice(1);
          mapaVisualizacoes[nomeCat] = v.visualizacoes;
          pageViews.categoriasTotal += v.visualizacoes;
        } else if (v.identificador.startsWith("CURSO_")) {
          let nomeCurso = v.identificador.replace("CURSO_", "").replace(/_/g, " ").toLowerCase();
          nomeCurso = nomeCurso.charAt(0).toUpperCase() + nomeCurso.slice(1);
          mapaCursos[nomeCurso] = v.visualizacoes;
        }
        else if (v.identificador === "LINK_GOV") {
          espacoExploreClicks.gov = v.visualizacoes;
        } else if (v.identificador === "LINK_WPP") {
          espacoExploreClicks.wpp = v.visualizacoes;
        } else if (v.identificador === "LINK_EMAIL") {
          espacoExploreClicks.email = v.visualizacoes;
        } else if (v.identificador === "PROFILE_SHARE") {
          perfilCompartilhado = v.visualizacoes;
        }
      });

      const chartCursos = Object.entries(mapaCursos)
        .map(([curso, qtd]) => ({ curso, qtd }))
        .sort((a, b) => b.qtd - a.qtd);

      const chartVisualizacoesPorCategoria = Object.entries(mapaVisualizacoes)
        .map(([categoria, views]) => ({ categoria, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10);

      return res.json({
        totalLocais,
        totalUsuarios,
        totalAvaliacoes,
        mediaAvaliacao,
        chartLocaisPorCategoria,
        chartVisualizacoesPorCategoria,
        chartDistribuicaoNotas,
        pageViews,
        chartCursos,
        espacoExploreClicks,
        perfilCompartilhado
      });
    } catch (error) {
      console.error("Erro dashboard:", error);
      return res.status(500).json({ message: "Erro ao buscar estatísticas." });
    }
  }

  static async rejectRequest(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const local = await prisma.local.findUnique({ where: { localId: Number(id) } });
      if (!local) return res.status(404).json({ message: "Local não encontrado." });

      await adminService.rejeitarSolicitacao(Number(id));

      // Tenta notificar por email se houver contato
      if (local.contatoLocal) {
        try {
          await EmailService.sendGenericEmail({
            to: local.contatoLocal,
            subject: "Sua solicitação foi rejeitada",
            html: `<p>Sua solicitação para o local <strong>${local.nomeLocal}</strong> foi rejeitada.</p><p>${reason || ''}</p>`,
          });
        } catch (err) {
          console.error('Falha ao enviar email de rejeição:', err);
        }
      }

      return res.status(200).json({ message: 'Solicitação rejeitada.' });
    } catch (error) {
      console.error('Erro ao rejeitar a solicitação (admin):', error);
      return res.status(500).json({ message: 'Erro ao rejeitar a solicitação.' });
    }
  }

  static async getInactiveLocals(req: Request, res: Response) {
    try {
      const locais = await LocalService.listarInativos();
      return res.status(200).json(locais);
    } catch (error: any) {
      console.error("Erro ao buscar locais inativos:", error);
      return res.status(500).json({ message: error.message || "Erro ao buscar locais inativos." });
    }
  }

  // =====================
  // Gerenciamento de usuários (rotas admin)
  // =====================

  static async getAllUsers(req: Request, res: Response) {
    try {
      const users = await prisma.usuario.findMany({
        select: {
          usuarioId: true,
          nomeCompleto: true,
          username: true,
          email: true,
          enabled: true,
          unconfirmedEmail: true,
          progressPercentage: true,
          currentTag: true,
        },
      });

      // Evita N+1 (uma query de contagem por usuário): agrega tudo de uma vez com groupBy.
      const [comentariosPorUsuario, locaisPorUsuario] = await Promise.all([
        prisma.avaliacao.groupBy({
          by: ["usuarioId"],
          where: { parentId: null },
          _count: { _all: true },
        }),
        prisma.local.groupBy({
          by: ["usuarioId"],
          _count: { _all: true },
        }),
      ]);

      const comentariosMap = new Map(comentariosPorUsuario.map((c) => [c.usuarioId, c._count._all]));
      const locaisMap = new Map(locaisPorUsuario.map((l) => [l.usuarioId, l._count._all]));

      const usersComInteracoes = users.map((userData) => {
        const comentariosCount = comentariosMap.get(userData.usuarioId) ?? 0;
        const projetosCount = locaisMap.get(userData.usuarioId) ?? 0;

        return {
          ...userData,
          interacoes: {
            comentariosCount,
            projetosCount,
            fezComentario: comentariosCount > 0,
            temProjetoCadastrado: projetosCount > 0,
          },
        };
      });

      return res.status(200).json(usersComInteracoes);
    } catch (error: any) {
      console.error("Erro ao listar usuários (admin):", error);
      return res.status(500).json({ message: error.message || "Erro ao listar usuários." });
    }
  }

  static async adminUpdateUser(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "ID inválido." });

      const updated = await AuthService.updateUserProfile(id, req.body);
      const { password, ...safe } = updated;
      return res.status(200).json(safe);
    } catch (error: any) {
      console.error("Erro ao atualizar usuário (admin):", error);
      return res.status(400).json({ message: error.message || "Erro ao atualizar usuário." });
    }
  }

  static async adminDeleteUser(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "ID inválido." });

      await AuthService.deleteUser(id);
      return res.status(200).json({ message: "Usuário excluído com sucesso." });
    } catch (error: any) {
      console.error("Erro ao excluir usuário (admin):", error);
      return res.status(500).json({ message: error.message || "Erro ao excluir usuário." });
    }
  }

  static async adminChangeUserPassword(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const { newPassword } = req.body;
      if (Number.isNaN(id)) return res.status(400).json({ message: "ID inválido." });
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        return res.status(400).json({ message: "A nova senha é obrigatória e deve ter ao menos 6 caracteres." });
      }

      const user = await prisma.usuario.findUnique({ where: { usuarioId: id } });
      if (!user) return res.status(404).json({ message: "Usuário não encontrado." });

      const hashed = await bcrypt.hash(newPassword, 10);
      await prisma.usuario.update({
        where: { usuarioId: id },
        data: { password: hashed, resetPasswordToken: null, resetPasswordTokenExpiry: null },
      });

      return res.status(200).json({ message: "Senha atualizada com sucesso." });
    } catch (error: any) {
      console.error("Erro ao alterar senha do usuário (admin):", error);
      return res.status(500).json({ message: error.message || "Erro ao alterar senha." });
    }
  }

  static async resendConfirmationEmail(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "ID inválido." });

      const user = await prisma.usuario.findUnique({ where: { usuarioId: id } });
      if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
      if (user.enabled) return res.status(400).json({ message: "Usuário já verificado." });

      let token = user.confirmationToken;
      if (!token) {
        token = uuidv4();
        await prisma.usuario.update({ where: { usuarioId: id }, data: { confirmationToken: token } });
      }

      await EmailService.sendConfirmationEmail(user.email, token);
      return res.status(200).json({ message: "Email de confirmação reenviado." });
    } catch (error: any) {
      console.error("Erro ao reenviar email de confirmação (admin):", error);
      return res.status(500).json({ message: error.message || "Erro ao reenviar email de confirmação." });
    }
  }
}
