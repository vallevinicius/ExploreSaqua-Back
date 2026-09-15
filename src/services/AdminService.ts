import prisma from "../prisma";
import { Local, StatusLocal, Prisma } from "@prisma/client";

class AdminService {
  /**
   * Aprova um novo local que foi cadastrado
   */
  public async aprovarNovoLocal(localId: number): Promise<Local> {
    const local = await prisma.local.findUnique({ where: { localId } });
    if (!local) throw new Error("Local não encontrado");

    return prisma.local.update({
      where: { localId },
      data: { status: StatusLocal.ativo, ativo: true },
    });
  }

  /**
   * Aprova as atualizações solicitadas por um proprietário.
   * Esta função pega o que está guardado no campo 'dadosAtualizacao'
   * e move para as colunas principais da tabela.
   */
  public async aprovarAtualizacao(localId: number): Promise<Local> {
    const local = await prisma.local.findUnique({ where: { localId } });

    if (!local) throw new Error("Local não encontrado");
    if (!local.dadosAtualizacao) throw new Error("Não há atualizações pendentes para este local");

    const novosDados = local.dadosAtualizacao as any;

    const data: Prisma.LocalUpdateInput = {
      dadosAtualizacao: Prisma.DbNull,
      status: StatusLocal.ativo,
      ativo: true,
    };

    // 1. Atualiza campos de texto se eles existirem no JSON
    if (novosDados.nomeLocal) data.nomeLocal = novosDados.nomeLocal;
    if (novosDados.categoria) data.categoria = novosDados.categoria;
    if (novosDados.descricao) data.descricao = novosDados.descricao;
    if (novosDados.endereco) data.endereco = novosDados.endereco;
    if (novosDados.contatoLocal) data.contatoLocal = novosDados.contatoLocal;
    if (novosDados.instagram) data.instagram = novosDados.instagram;
    if (novosDados.latitude) data.latitude = novosDados.latitude;
    if (novosDados.longitude) data.longitude = novosDados.longitude;

    // 2. Atualiza campos de contato do responsável
    if (novosDados.emailResponsavel) data.emailResponsavel = novosDados.emailResponsavel;
    if (novosDados.contatoResponsavel) data.contatoResponsavel = novosDados.contatoResponsavel;

    // 3. Atualiza URLs de arquivos e documentos
    if (novosDados.logoUrl) data.logoUrl = novosDados.logoUrl;
    if (novosDados.alvaraVigilanciaUrl) data.alvaraVigilanciaUrl = novosDados.alvaraVigilanciaUrl;
    if (novosDados.alvaraFuncionamentoUrl) data.alvaraFuncionamentoUrl = novosDados.alvaraFuncionamentoUrl;

    // 4. Se houver novas imagens na galeria dentro do JSON, e a atualização do local,
    // tudo dentro de uma única transação para não deixar dado inconsistente.
    return prisma.$transaction(async (tx) => {
      if (novosDados.imagens && Array.isArray(novosDados.imagens)) {
        await tx.imagemLocal.deleteMany({ where: { localId } });
        await tx.imagemLocal.createMany({
          data: novosDados.imagens.map((url: string) => ({ localId, url })),
        });
      }

      // 5. Finaliza a transição
      return tx.local.update({ where: { localId }, data });
    });
  }

  /**
   * Rejeita qualquer solicitação (Novo local, Atualização ou Exclusão)
   */
  public async rejeitarSolicitacao(localId: number): Promise<Local> {
    const local = await prisma.local.findUnique({ where: { localId } });
    if (!local) throw new Error("Local não encontrado");

    // Se for um novo cadastro sendo rejeitado, vai para status REJEITADO
    // Se for uma atualização rejeitada, apenas limpa o rascunho e volta a ser ATIVO
    const data: Prisma.LocalUpdateInput =
      local.status === StatusLocal.pendente_atualizacao
        ? { dadosAtualizacao: Prisma.DbNull, status: StatusLocal.ativo }
        : { status: StatusLocal.rejeitado, ativo: false };

    return prisma.local.update({ where: { localId }, data });
  }

  /**
   * Aprova a exclusão definitiva do local
   */
  public async aprovarExclusao(localId: number): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const local = await tx.local.findUnique({ where: { localId } });
      if (!local) throw new Error("Local não encontrado");

      // Deleta imagens relacionadas primeiro (Cascade manual se não houver no banco)
      await tx.imagemLocal.deleteMany({ where: { localId } });

      // Deleta o local
      await tx.local.delete({ where: { localId } });
    });
  }

  /**
   * Lista todas as solicitações pendentes para o painel do Admin
   */
  public async listarPendencias() {
    return prisma.local.findMany({
      where: {
        status: {
          in: [StatusLocal.pendente_aprovacao, StatusLocal.pendente_atualizacao, StatusLocal.pendente_exclusao],
        },
      },
    });
  }
}

export default new AdminService();
