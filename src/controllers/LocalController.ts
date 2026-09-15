import { Request, Response } from "express";
import LocalService from "../services/LocalService";
import fs from "fs/promises";
import path from "path";
import prisma from "../prisma";
import { Prisma } from "@prisma/client";
import ProfanityFilter from "../utils/ProfanityFilter";

class LocalController {
  // CORREÇÃO: Função limpa para deletar arquivos em caso de falha
  private _deleteUploadedFilesOnFailure = async (req: Request) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    if (!files) return;

    const filesToDelete = Object.values(files).flat();
    await Promise.all(
      filesToDelete.map((file) =>
        fs.unlink(file.path).catch((err) =>
          console.error(`Falha ao deletar arquivo ${file.path}: ${err.message}`)
        )
      )
    );
  };

  private _handleError = (error: any, res: Response): Response => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2000") {
      return res.status(400).json({ message: "Um dos campos excedeu o limite de caracteres permitido." });
    }
    if (error.message?.includes("não encontrado")) {
      return res.status(404).json({ message: error.message });
    }
    console.error("ERRO NO CONTROLLER:", error);
    return res.status(500).json({ message: error.message || "Ocorreu um erro interno no servidor." });
  };

  // Prepara os dados e move os arquivos para as pastas definitivas
  private _moveFilesAndPrepareData = async (
    req: Request,
    existingInfo?: { categoria: string | null; nomeLocal: string | null }
  ): Promise<any> => {
    const dadosDoFormulario = req.body;
    const arquivos = (req.files as { [fieldname: string]: Express.Multer.File[] } | undefined) || {};

    // Função para garantir que campos de texto não venham como arrays [Bug do Multer]
    const fixString = (val: any) => (Array.isArray(val) ? val[0] : val);
    const normalizeOptionalString = (val: any) => {
      const fixed = fixString(val);
      if (fixed === undefined || fixed === null) return undefined;
      const normalized = String(fixed).trim();
      if (!normalized) return undefined;
      const lowered = normalized.toLowerCase();
      return lowered === "undefined" || lowered === "null" ? undefined : normalized;
    };

    const categoria = fixString(existingInfo?.categoria || dadosDoFormulario.categoria);
    const nomeLocal = fixString(existingInfo?.nomeLocal || dadosDoFormulario.nomeLocal || dadosDoFormulario.nomeFantasia || dadosDoFormulario.nomeProjeto);

    const sanitize = (name: string) => (name || "").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const safeCategoria = sanitize(categoria || "geral");
    const safenomeLocal = sanitize(nomeLocal || "local_sem_nome");

    const targetDir = path.resolve("uploads", safeCategoria, safenomeLocal);
    await fs.mkdir(targetDir, { recursive: true });

    const moveFile = async (file?: Express.Multer.File): Promise<string | undefined> => {
      if (!file) return undefined;
      const newPath = path.join(targetDir, file.filename);
      await fs.rename(file.path, newPath);
      return path.join("uploads", safeCategoria, safenomeLocal, file.filename).replace(/\\/g, "/");
    };

    const logoPath = await moveFile(arquivos["logo"]?.[0]);
    const alvaraFuncPath = await moveFile(arquivos["alvara_funcionamento"]?.[0]);
    const vigilanciaPath = await moveFile(arquivos["vigilancia_sanitaria"]?.[0]);

    const galleryFiles =
      arquivos["imagens"] ||
      arquivos["portfolio"] ||
      arquivos["produtos"] ||
      arquivos["produtosImg"] ||
      arquivos["localImg"] ||
      [];
    const imagensPaths: string[] = [];
    for (const file of galleryFiles) {
      const newPath = await moveFile(file);
      if (newPath) imagensPaths.push(newPath);
    }

    // Retorna os dados limpos (strings e caminhos dos arquivos)
    return {
      ...dadosDoFormulario,
      nomeLocal: normalizeOptionalString(dadosDoFormulario.nomeLocal),
      categoria: normalizeOptionalString(dadosDoFormulario.categoria),
      nomeResponsavel: normalizeOptionalString(dadosDoFormulario.nomeResponsavel),
      cpfResponsavel: normalizeOptionalString(dadosDoFormulario.cpfResponsavel),
      emailResponsavel: normalizeOptionalString(
        dadosDoFormulario.emailResponsavel || dadosDoFormulario.emailContato,
      ),
      contatoResponsavel: normalizeOptionalString(dadosDoFormulario.contatoResponsavel),
      contatoLocal: normalizeOptionalString(dadosDoFormulario.contatoLocal),
      endereco: normalizeOptionalString(dadosDoFormulario.endereco),
      descricao: normalizeOptionalString(dadosDoFormulario.descricao),
      instagram: normalizeOptionalString(dadosDoFormulario.instagram),
      latitude: dadosDoFormulario.latitude ? parseFloat(fixString(dadosDoFormulario.latitude)) : null,
      longitude: dadosDoFormulario.longitude ? parseFloat(fixString(dadosDoFormulario.longitude)) : null,
      logoUrl: logoPath,
      alvaraFuncionamentoUrl: alvaraFuncPath,
      alvaraVigilanciaUrl: vigilanciaPath,
      imagens: imagensPaths.length > 0 ? imagensPaths : undefined,
    };
  };

  public cadastrar = async (req: Request, res: Response): Promise<Response> => {
    try {
      const usuarioLogadoId = (req as any).user?.id;
      if (!usuarioLogadoId) {
        return res.status(401).json({ message: "Acesso negado. Faça login para cadastrar um local." });
      }

      const localIdParaAtualizacao = Number((req.body as any)?.localId || (req.body as any)?.id || 0);

      // Compatibilidade com front do perfil: se vier localId/id no payload do cadastro,
      // tratamos como solicitação de atualização para não criar um novo registro.
      if (Number.isFinite(localIdParaAtualizacao) && localIdParaAtualizacao > 0) {
        const dadosAtualizacao = await this._moveFilesAndPrepareData(req);
        dadosAtualizacao.usuarioId = usuarioLogadoId;

        const localAtualizado = await LocalService.solicitarAtualizacao(
          localIdParaAtualizacao,
          dadosAtualizacao,
        );
        return res.status(200).json(localAtualizado);
      }

      const dadosCompletos = await this._moveFilesAndPrepareData(req);
      dadosCompletos.usuarioId = usuarioLogadoId;

      // Se for indicação, mapeia campos específicos vindos do FormData
      if (dadosCompletos.tipoCadastro && String(dadosCompletos.tipoCadastro) === "indication") {
        // Garante que campos do indicador venham como strings
        dadosCompletos.indicadorNome = dadosCompletos.indicadorNome ? String(dadosCompletos.indicadorNome) : null;
        dadosCompletos.indicadorContato = dadosCompletos.indicadorContato ? String(dadosCompletos.indicadorContato) : null;
        dadosCompletos.indicadorEmail = dadosCompletos.indicadorEmail ? String(dadosCompletos.indicadorEmail) : null;
      }

      const novoLocal = await LocalService.cadastrarLocalComImagens(dadosCompletos);
      return res.status(201).json(novoLocal);
    } catch (error: any) {
      await this._deleteUploadedFilesOnFailure(req);
      return this._handleError(error, res);
    }
  };

  public solicitarAtualizacao = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const dadosAtualizacao = await this._moveFilesAndPrepareData(req);
      dadosAtualizacao.usuarioId = (req as any).user?.id;

      // Validação de palavrões nos campos de atualização
      const camposParaVerificar = ["nomeLocal", "descricao", "nomeResponsavel", "categoria", "endereco"];
      for (const campo of camposParaVerificar) {
        const valor = (dadosAtualizacao as any)[campo];
        if (typeof valor === "string" && ProfanityFilter.contemPalavrao(valor)) {
          await this._deleteUploadedFilesOnFailure(req);
          return res.status(400).json({ message: `O campo '${campo}' contém palavras proibidas.` });
        }
      }

      const localAtualizado = await LocalService.solicitarAtualizacao(Number(id), dadosAtualizacao);
      return res.status(200).json(localAtualizado);
    } catch (error: any) {
      await this._deleteUploadedFilesOnFailure(req);
      return res.status(400).json({ message: error.message });
    }
  };

  public solicitarExclusao = async (req: Request, res: Response): Promise<Response> => {
    try {
      const usuarioLogadoId = (req as any).user?.id;
      const localIdInformado = Number((req.body as any)?.localId || (req.body as any)?.id || 0);

      let localId = localIdInformado;

      if (!localId && usuarioLogadoId) {
        const localDoUsuario = await prisma.local.findFirst({
          where: { usuarioId: usuarioLogadoId },
          orderBy: { localId: "desc" },
        });

        localId = localDoUsuario?.localId ?? 0;
      }

      if (!localId) {
        return res.status(400).json({ message: "Não foi possível identificar o local para exclusão." });
      }

      const localExistente = await prisma.local.findUnique({ where: { localId } });
      if (!localExistente) return res.status(404).json({ message: "Local não encontrado." });

      if (usuarioLogadoId && localExistente.usuarioId && Number(localExistente.usuarioId) !== Number(usuarioLogadoId)) {
        return res.status(403).json({ message: "Você não tem permissão para solicitar exclusão deste local." });
      }

      const dadosCompletos = await this._moveFilesAndPrepareData(req, {
        categoria: localExistente.categoria,
        nomeLocal: localExistente.nomeLocal,
      });

      // Validação de palavrões na solicitação de exclusão
      const camposParaVerificarExclusao = ["nomeLocal", "descricao", "nomeResponsavel", "categoria", "endereco"];
      for (const campo of camposParaVerificarExclusao) {
        const valor = (dadosCompletos as any)[campo];
        if (typeof valor === "string" && ProfanityFilter.contemPalavrao(valor)) {
          await this._deleteUploadedFilesOnFailure(req);
          return res.status(400).json({ message: `O campo '${campo}' contém palavras proibidas.` });
        }
      }

      await LocalService.solicitarExclusao(localId, dadosCompletos);
      return res.status(200).json({ message: "Solicitação de exclusão enviada." });
    } catch (error: any) {
      await this._deleteUploadedFilesOnFailure(req);
      return this._handleError(error, res);
    }
  };

  public listarTodos = async (req: Request, res: Response): Promise<Response> => {
    try {
      const locais = await LocalService.listarTodos();
      return res.status(200).json(locais);
    } catch (error: any) {
      return this._handleError(error, res);
    }
  };

  public buscarPorCategoria = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { categoria } = req.params;
      const locais = await LocalService.buscarPorCategoria(categoria);
      return res.status(200).json(locais);
    } catch (error: any) {
      return this._handleError(error, res);
    }
  };

  public buscarPorNome = async (req: Request, res: Response): Promise<Response> => {
    try {
      const nome = (req.params.nome || req.query.nome) as string;
      const locais = await LocalService.buscarPorNome(nome);
      return res.status(200).json(locais);
    } catch (error: any) {
      return this._handleError(error, res);
    }
  };

  public buscarPorId = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = parseInt(req.params.id);
      const local = await LocalService.buscarPorId(id);
      if (!local) return res.status(404).json({ message: "Local não encontrado." });
      return res.status(200).json(local);
    } catch (error: any) {
      return this._handleError(error, res);
    }
  };

  public alterarStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const id = parseInt(req.params.id);
      const { ativo } = req.body;
      if (typeof ativo !== "boolean") {
        return res.status(400).json({ message: "O valor 'ativo' deve ser booleano." });
      }
      const local = await LocalService.alterarStatusAtivo(id, ativo);
      return res.status(200).json(local);
    } catch (error: any) {
      return this._handleError(error, res);
    }
  };

  public registrarVisualizacao = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { identificador } = req.params;
      if (!identificador) return res.status(400).json({ message: "ID obrigatório." });

      let chaveFormatada = identificador.trim().toUpperCase();
      if (!chaveFormatada.startsWith("CAT_") && chaveFormatada !== "HOME") {
        chaveFormatada = "CAT_" + chaveFormatada.replace(/[^A-Z0-9]/g, "_");
      }

      let registro = await prisma.contadorVisualizacao.findUnique({ where: { identificador: chaveFormatada } });
      if (!registro) {
        registro = await prisma.contadorVisualizacao.create({
          data: { identificador: chaveFormatada, visualizacoes: 0 },
        });
      }

      await prisma.contadorVisualizacao.update({
        where: { id: registro.id },
        data: { visualizacoes: { increment: 1 } },
      });
      return res.status(200).json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: "Erro interno." });
    }
  };
}

export default new LocalController();