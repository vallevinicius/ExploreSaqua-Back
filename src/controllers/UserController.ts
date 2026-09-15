import { Request, Response } from 'express';
import AuthService from '../services/AuthService';
import prisma from '../prisma';
import { Local } from '@prisma/client';
import fs from "fs/promises";
import path from "path";
import ProfanityFilter from "../utils/ProfanityFilter";

interface AuthenticatedRequest extends Request {
    user?: {
        id: number;
        username: string;
    };
    admin?: {
        username?: string;
        role?: string;
    };
}

class UserController {
    private getTargetUserId = (req: AuthenticatedRequest): number | null => {
        const isAdmin = req.admin?.role === 'admin';
        if (isAdmin) {
            const rawId = req.query.usuarioId ?? req.query.userId;
            if (typeof rawId === 'undefined') return null;
            const parsed = Number(rawId);
            if (!Number.isInteger(parsed) || parsed <= 0) return null;
            return parsed;
        }

        const userId = req.user?.id;
        return Number.isInteger(userId) ? userId as number : null;
    };

    public updateUserProfile = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "Não autorizado" });

            const updatedUser = await AuthService.updateUserProfile(userId, req.body);
            const { password, ...userDTO } = updatedUser;

            return res.json(userDTO);
        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    };

    public deleteUserProfile = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "Não autorizado" });

            await AuthService.deleteUser(userId);
            return res.json({ message: "Perfil de utilizador excluído com sucesso." });
        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    };

    public updateUserPassword = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "Não autorizado" });

            await AuthService.updateUserPassword(userId, req.body);
            return res.json({ message: "Senha alterada com sucesso." });
        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    };

    public listarMeusEstabelecimentos = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
        try {
            const userId = this.getTargetUserId(req);
            if (!userId) {
                return res.status(400).json({ message: "Usuário alvo inválido. Informe usuarioId/userId válido." });
            }

            const locais = await prisma.local.findMany({
                where: { usuarioId: userId },
                include: {
                    locaisImg: { select: { url: true } },
                },
                orderBy: { localId: "desc" },
            });

            return res.status(200).json({
                total: locais.length,
                locais,
            });
        } catch (error: any) {
            return res.status(500).json({ message: error.message || "Erro ao listar estabelecimentos." });
        }
    };

    public listarMeusComentarios = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
        try {
            const userId = this.getTargetUserId(req);
            if (!userId) {
                return res.status(400).json({ message: "Usuário alvo inválido. Informe usuarioId/userId válido." });
            }

            const comentarios = await prisma.avaliacao.findMany({
                where: { usuarioId: userId },
                include: {
                    local: { select: { localId: true, nomeLocal: true, categoria: true } },
                },
                orderBy: { avaliacoesId: "desc" },
            });

            return res.status(200).json({
                total: comentarios.length,
                comentarios,
            });
        } catch (error: any) {
            return res.status(500).json({ message: error.message || "Erro ao listar comentários." });
        }
    };

    public listarMinhasAvaliacoes = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
        try {
            const userId = this.getTargetUserId(req);
            if (!userId) {
                return res.status(400).json({ message: "Usuário alvo inválido. Informe usuarioId/userId válido." });
            }

            const avaliacoes = await prisma.avaliacao.findMany({
                where: { usuarioId: userId },
                include: {
                    local: { select: { localId: true, nomeLocal: true, categoria: true } },
                    usuario: { select: { usuarioId: true, username: true, nomeCompleto: true } },
                },
                orderBy: { avaliacoesId: "desc" },
            });

            return res.status(200).json({
                total: avaliacoes.length,
                avaliacoes,
            });
        } catch (error: any) {
            return res.status(500).json({ message: error.message || "Erro ao listar avaliações." });
        }
    };

    public listarMeusReviews = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
        return this.listarMinhasAvaliacoes(req, res);
    };

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

    private _moveFilesAndPrepareData = async (req: Request, localExistente: Local): Promise<any> => {
        const dadosDoFormulario = req.body;
        const arquivos = (req.files as { [fieldname: string]: Express.Multer.File[] } | undefined) || {};

        const fixString = (val: any) => (Array.isArray(val) ? val[0] : val);
        const categoria = fixString(localExistente.categoria);
        const nomeLocal = fixString(localExistente.nomeLocal);

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

        const logoPath = await moveFile(
            arquivos["logo"]?.[0] || arquivos["logoUrl"]?.[0]
        );
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

        return {
            ...dadosDoFormulario,
            nomeLocal: fixString(dadosDoFormulario.nomeLocal) || localExistente.nomeLocal,
            categoria: fixString(dadosDoFormulario.categoria) || localExistente.categoria,
            descricao: fixString(dadosDoFormulario.descricao) || localExistente.descricao,
            endereco: fixString(dadosDoFormulario.endereco) || localExistente.endereco,
            instagram: fixString(dadosDoFormulario.instagram) || localExistente.instagram,
            contatoLocal: fixString(dadosDoFormulario.contatoLocal) || localExistente.contatoLocal,
            logoUrl: logoPath,
            imagens: imagensPaths.length > 0 ? imagensPaths : undefined,
        };
    };

    public atualizarMeuEstabelecimento = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "Não autorizado" });

            const { localId } = req.params;
            if (!localId || Number.isNaN(Number(localId))) {
                await this._deleteUploadedFilesOnFailure(req);
                return res.status(400).json({ message: "ID do estabelecimento inválido." });
            }

            const local = await prisma.local.findUnique({ where: { localId: Number(localId) } });
            if (!local) {
                await this._deleteUploadedFilesOnFailure(req);
                return res.status(404).json({ message: "Estabelecimento não encontrado." });
            }

            // Validar que o usuário é o dono do estabelecimento
            if (local.usuarioId !== userId) {
                await this._deleteUploadedFilesOnFailure(req);
                return res.status(403).json({ message: "Você não tem permissão para alterar este estabelecimento." });
            }

            const dadosAtualizacao = await this._moveFilesAndPrepareData(req, local);

            // Validação de palavrões
            const camposParaVerificar = ["nomeLocal", "descricao", "categoria", "endereco"];
            for (const campo of camposParaVerificar) {
                const valor = (dadosAtualizacao as any)[campo];
                if (typeof valor === "string" && ProfanityFilter.contemPalavrao(valor)) {
                    await this._deleteUploadedFilesOnFailure(req);
                    return res.status(400).json({ message: `O campo '${campo}' contém palavras proibidas.` });
                }
            }

            // Monta os campos básicos a atualizar
            const dataUpdate: Record<string, any> = {};
            if (dadosAtualizacao.nomeLocal) dataUpdate.nomeLocal = dadosAtualizacao.nomeLocal;
            if (dadosAtualizacao.categoria) dataUpdate.categoria = dadosAtualizacao.categoria;
            if (dadosAtualizacao.descricao) dataUpdate.descricao = dadosAtualizacao.descricao;
            if (dadosAtualizacao.endereco) dataUpdate.endereco = dadosAtualizacao.endereco;
            if (dadosAtualizacao.instagram) dataUpdate.instagram = dadosAtualizacao.instagram;
            if (dadosAtualizacao.contatoLocal) dataUpdate.contatoLocal = dadosAtualizacao.contatoLocal;

            // Atualizar logo se fornecida
            if (dadosAtualizacao.logoUrl) {
                if (local.logoUrl) {
                    try {
                        await fs.unlink(path.join(__dirname, "..", "..", local.logoUrl));
                    } catch (err) {
                        console.warn(`Falha ao deletar logo antiga: ${local.logoUrl}`);
                    }
                }
                dataUpdate.logoUrl = dadosAtualizacao.logoUrl;
            }

            await prisma.local.update({ where: { localId: local.localId }, data: dataUpdate });

            // Atualizar imagens se fornecidas
            if (dadosAtualizacao.imagens && Array.isArray(dadosAtualizacao.imagens) && dadosAtualizacao.imagens.length > 0) {
                const imagensAntigas = await prisma.imagemLocal.findMany({
                    where: { localId: local.localId },
                });

                for (const imagem of imagensAntigas) {
                    if (!imagem.url) continue;
                    try {
                        await fs.unlink(path.join(__dirname, "..", "..", imagem.url));
                    } catch (err) {
                        console.warn(`Falha ao deletar imagem antiga: ${imagem.url}`);
                    }
                }

                await prisma.imagemLocal.deleteMany({ where: { localId: local.localId } });

                await prisma.imagemLocal.createMany({
                    data: dadosAtualizacao.imagens.map((url: string) => ({
                        url,
                        localId: local.localId,
                    })),
                });
            }

            // Buscar dados atualizados para retornar
            const localAtualizadoDb = await prisma.local.findUnique({ where: { localId: local.localId } });
            const imagensAtualizadas = await prisma.imagemLocal.findMany({
                where: { localId: local.localId },
                select: { url: true },
            });

            const localAtualizado: any = { ...localAtualizadoDb };
            localAtualizado.locaisImg = imagensAtualizadas;

            return res.status(200).json({
                message: "Estabelecimento atualizado com sucesso.",
                local: localAtualizado,
            });
        } catch (error: any) {
            await this._deleteUploadedFilesOnFailure(req);
            console.error("Erro ao atualizar estabelecimento:", error);
            return res.status(500).json({ message: error.message || "Erro ao atualizar estabelecimento." });
        }
    };
}

export default new UserController();
