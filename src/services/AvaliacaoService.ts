import prisma from "../prisma";
import ProfanityFilter from "../utils/ProfanityFilter";
import { containsEmoji } from "../utils/ValidationEmoji";
import EmailService from "../utils/EmailService";

// Espelha o antigo `attributes: { exclude: [...] }` do Sequelize: nunca devolve
// senha/tokens do usuário que comentou.
const USUARIO_SELECT_PUBLICO = {
  usuarioId: true,
  nomeCompleto: true,
  username: true,
  progressPercentage: true,
  currentTag: true,
} as const;

class AvaliacaoService {
  public async submeterAvaliacao(dadosAvaliacao: any, usuarioLogadoId: number) {
    const { nota, comentario, localId, parent_id } = dadosAvaliacao;

    // Validações (estavam corretas)
    if (!localId) {
      throw new Error("O ID do local é obrigatório.");
    }
    if (ProfanityFilter.contemPalavrao(comentario)) {
      throw new Error("Você utilizou palavras inapropriadas.");
    }
    if (containsEmoji(comentario)) {
      throw new Error("O comentário não pode conter emojis.");
    }

    const local = await prisma.local.findUnique({ where: { localId } });
    if (!local) {
      throw new Error(`Local não encontrado com o ID: ${localId}`);
    }

    let notaFinal: number | null = nota;

    if (parent_id) {
      // É UMA RESPOSTA
      notaFinal = null; // Respostas não têm nota

      const parentAvaliacao = await prisma.avaliacao.findUnique({ where: { avaliacoesId: parent_id } });
      if (!parentAvaliacao) {
        throw new Error("Comentário pai não encontrado.");
      }
      if (parentAvaliacao.parentId !== null) {
        throw new Error("Não é possível responder a uma resposta.");
      }
      if (parentAvaliacao.localId !== local.localId) {
        throw new Error("A resposta não pertence ao mesmo local do comentário pai.");
      }
    } else {
      // É UM COMENTÁRIO PRINCIPAL
      if (!nota || nota < 1 || nota > 5) {
        throw new Error("A nota da avaliação (1 a 5) é obrigatória para um novo comentário.");
      }

      const avaliacaoExistente = await prisma.avaliacao.findFirst({
        where: {
          usuarioId: usuarioLogadoId,
          localId,
          parentId: null,
        },
      });

      if (avaliacaoExistente) {
        throw new Error("Cada usuário só pode avaliar um local uma vez.");
      }
    }

    const novaAvaliacao = await prisma.avaliacao.create({
      data: {
        nota: notaFinal, // Será 'null' para respostas
        comentario,
        localId,
        usuarioId: usuarioLogadoId,
        parentId: parent_id || null, // Salva a referência pai, se existir
      },
    });

    // --- Início da Notificação por E-mail (comportamento original preservado) ---
    try {
      const usuario = await prisma.usuario.findUnique({ where: { usuarioId: usuarioLogadoId } });
      // Nota: "emailLocal" nunca existiu como coluna de Local (nem no model Sequelize
      // antigo, nem no schema Prisma) — este bloco já era código morto antes da migração.
      const emailLocal = (local as any).emailLocal;

      if (emailLocal && usuario) {
        const eUmaResposta = parent_id ? "uma nova resposta" : "um novo comentário";
        const notaTexto = notaFinal ? `(Nota: ${notaFinal}/5)` : "";

        const subject = `[ExploreSaqua] Novo Comentário no seu local: ${local.nomeLocal}`;
        const html = `
          <p>Olá, ${local.nomeResponsavel || local.nomeLocal},</p>
          <p>Seu local "<strong>${local.nomeLocal}</strong>" recebeu ${eUmaResposta} na plataforma ExploreSaqua.</p>
          <br>
          <p><strong>Usuário:</strong> ${usuario.username}</p>
          <p><strong>Comentário ${notaTexto}:</strong></p>
          <blockquote style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 5px; font-style: italic;">
            "${comentario}"
          </blockquote>
          <br>
          <p>Acesse a plataforma para ver mais detalhes.</p>
          <p>Atenciosamente,<br>Equipe ExploreSaqua</p>
        `;

        await EmailService.sendGenericEmail({
          to: emailLocal as string,
          subject,
          html,
        });
      }
    } catch (emailError: any) {
      console.error(
        `Falha ao enviar e-mail de notificação de avaliação para ${local.nomeLocal}:`,
        emailError.message
      );
    }
    // --- Fim da Notificação por E-mail ---

    return novaAvaliacao;
  }

  public async atualizarAvaliacao(avaliacaoId: number, dadosAvaliacao: any, usuarioLogadoId: number) {
    const avaliacao = await prisma.avaliacao.findUnique({ where: { avaliacoesId: avaliacaoId } });
    if (!avaliacao) {
      throw new Error(`Avaliação não encontrada com o ID: ${avaliacaoId}`);
    }
    if (avaliacao.usuarioId !== usuarioLogadoId) {
      throw new Error("Você não tem permissão para editar esta avaliação.");
    }

    if (dadosAvaliacao.comentario && ProfanityFilter.contemPalavrao(dadosAvaliacao.comentario)) {
      throw new Error("Você utilizou palavras inapropriadas.");
    }

    const data: { nota?: number | null; comentario?: string | null } = {};

    // Só permite atualizar a nota se FOR UM COMENTÁRIO PRINCIPAL (sem parentId)
    if (avaliacao.parentId === null && dadosAvaliacao.nota != null) {
      if (dadosAvaliacao.nota < 1 || dadosAvaliacao.nota > 5) {
        throw new Error("A nota da avaliação deve estar entre 1 e 5.");
      }
      data.nota = dadosAvaliacao.nota;
    } else if (avaliacao.parentId !== null) {
      // Se for uma resposta, garante que a nota permaneça nula
      data.nota = null;
    }

    data.comentario = dadosAvaliacao.comentario ?? avaliacao.comentario;

    return prisma.avaliacao.update({ where: { avaliacoesId: avaliacaoId }, data });
  }

  public async excluirAvaliacao(avaliacaoId: number, usuarioLogadoId: number) {
    const avaliacao = await prisma.avaliacao.findUnique({ where: { avaliacoesId: avaliacaoId } });
    if (!avaliacao) {
      throw new Error(`Avaliação não encontrada com o ID: ${avaliacaoId}`);
    }
    if (avaliacao.usuarioId !== usuarioLogadoId) {
      throw new Error("Você não tem permissão para excluir esta avaliação.");
    }
    await prisma.avaliacao.delete({ where: { avaliacoesId: avaliacaoId } });
  }

  public async listarPorLocalDTO(localId: number) {
    return prisma.avaliacao.findMany({
      where: {
        localId,
        parentId: null, // Busca APENAS comentários principais
      },
      include: {
        usuario: { select: USUARIO_SELECT_PUBLICO },
        respostas: {
          include: { usuario: { select: USUARIO_SELECT_PUBLICO } },
          orderBy: { avaliacoesId: "asc" },
        },
      },
      orderBy: { avaliacoesId: "desc" },
    });
  }
}

export default new AvaliacaoService();
