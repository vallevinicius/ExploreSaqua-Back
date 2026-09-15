import prisma from "../prisma";
import { Local, StatusLocal } from "@prisma/client";
import ProfanityFilter from "../utils/ProfanityFilter";

const normalizeString = (value: any): string | undefined => {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (rawValue === undefined || rawValue === null) {
    return undefined;
  }

  const normalized = String(rawValue).trim();
  if (!normalized) {
    return undefined;
  }

  const lowered = normalized.toLowerCase();
  if (lowered === "undefined" || lowered === "null") {
    return undefined;
  }

  return normalized;
};

const parseOptionalNumber = (value: any): number | null => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const parsed = parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

class LocalService {
  public async cadastrarLocalComImagens(dados: any): Promise<Local> {
    return prisma.$transaction(async (tx) => {
      const usuarioId = dados.usuarioId ? Number(dados.usuarioId) : null;
      let usuarioPerfil: { email: string; nomeCompleto: string; username: string } | null = null;
      let ultimoLocalDoUsuario: {
        nomeResponsavel: string;
        cpfResponsavel: string;
        emailResponsavel: string;
        contatoResponsavel: string;
      } | null = null;

      if (usuarioId) {
        usuarioPerfil = await tx.usuario.findUnique({
          where: { usuarioId },
          select: { email: true, nomeCompleto: true, username: true },
        });

        ultimoLocalDoUsuario = await tx.local.findFirst({
          where: { usuarioId },
          orderBy: { localId: "desc" },
          select: {
            nomeResponsavel: true,
            cpfResponsavel: true,
            emailResponsavel: true,
            contatoResponsavel: true,
          },
        });
      }

      let emailResponsavel =
        normalizeString(dados.emailResponsavel) ?? normalizeString(dados.emailContato);

      if (!emailResponsavel && ultimoLocalDoUsuario) {
        emailResponsavel = normalizeString(ultimoLocalDoUsuario.emailResponsavel);
      }

      // Fallback para fluxo de perfil: se o e-mail não vier no form,
      // usa o e-mail da conta autenticada associada ao usuarioId.
      if (!emailResponsavel && usuarioPerfil) {
        emailResponsavel = normalizeString(usuarioPerfil.email);
      }

      let nomeResponsavel = normalizeString(dados.nomeResponsavel);

      if (!nomeResponsavel && ultimoLocalDoUsuario) {
        nomeResponsavel = normalizeString(ultimoLocalDoUsuario.nomeResponsavel);
      }

      // Fallback para fluxo de perfil: usa nome completo (ou username) do usuário logado.
      if (!nomeResponsavel && usuarioPerfil) {
        nomeResponsavel =
          normalizeString(usuarioPerfil.nomeCompleto) ?? normalizeString(usuarioPerfil.username);
      }

      let cpfResponsavel = normalizeString(dados.cpfResponsavel);
      if (!cpfResponsavel && ultimoLocalDoUsuario) {
        cpfResponsavel = normalizeString(ultimoLocalDoUsuario.cpfResponsavel);
      }

      let contatoResponsavel = normalizeString(dados.contatoResponsavel);
      if (!contatoResponsavel && ultimoLocalDoUsuario) {
        contatoResponsavel = normalizeString(ultimoLocalDoUsuario.contatoResponsavel);
      }

      if (!emailResponsavel) {
        throw new Error("O campo 'emailResponsavel' é obrigatório.");
      }

      if (!nomeResponsavel) {
        throw new Error("O campo 'nomeResponsavel' é obrigatório.");
      }

      if (!cpfResponsavel) {
        throw new Error("O campo 'cpfResponsavel' é obrigatório.");
      }

      if (!contatoResponsavel) {
        throw new Error("O campo 'contatoResponsavel' é obrigatório.");
      }

      const dadosParaCriacao = {
        usuarioId,
        nomeLocal: normalizeString(dados.nomeLocal),
        categoria: normalizeString(dados.categoria),
        nomeResponsavel,
        cpfResponsavel,
        emailResponsavel,
        contatoResponsavel,
        contatoLocal: normalizeString(dados.contatoLocal),
        endereco: normalizeString(dados.endereco),
        descricao: normalizeString(dados.descricao),
        instagram: normalizeString(dados.instagram),
        latitude: parseOptionalNumber(dados.latitude),
        longitude: parseOptionalNumber(dados.longitude),
        logoUrl: normalizeString(dados.logoUrl),
        alvaraFuncionamentoUrl: normalizeString(dados.alvaraFuncionamentoUrl),
        alvaraVigilanciaUrl: normalizeString(dados.alvaraVigilanciaUrl),
        ativo: false,
        status: StatusLocal.pendente_aprovacao,

        // Campos opcionais para indicar que este cadastro é uma indicação
        tipoCadastro: normalizeString(dados.tipoCadastro),
        indicadorNome: normalizeString(dados.indicadorNome),
        indicadorContato: normalizeString(dados.indicadorContato),
        indicadorEmail: normalizeString(dados.indicadorEmail),
      };

      // Validação de conteúdo: verificar se algum campo contém palavrões
      const camposParaVerificar = ["nomeLocal", "descricao", "nomeResponsavel", "categoria", "endereco"];
      for (const campo of camposParaVerificar) {
        const valor = (dadosParaCriacao as any)[campo];
        if (typeof valor === "string" && ProfanityFilter.contemPalavrao(valor)) {
          throw new Error(`O campo '${campo}' contém palavras proibidas.`);
        }
      }

      // Verifica se já existe um local com o mesmo nome e status diferente de REJEITADO
      const localExistente = await tx.local.findFirst({
        where: {
          nomeLocal: dadosParaCriacao.nomeLocal,
          status: { not: StatusLocal.rejeitado },
        },
      });

      if (localExistente) {
        throw new Error("Já existe um local cadastrado com esse nome.");
      }

      const local = await tx.local.create({ data: dadosParaCriacao });

      const imagensInput = Array.isArray(dados.imagens)
        ? dados.imagens
        : Array.isArray(dados.produtos)
          ? dados.produtos
          : Array.isArray(dados.portfolio)
            ? dados.portfolio
            : [];

      // Galeria de imagens
      if (imagensInput.length > 0) {
        await tx.imagemLocal.createMany({
          data: imagensInput.map((url: string) => ({ url, localId: local.localId })),
        });
      }

      return local;
    });
  }

  public async solicitarAtualizacao(id: number, dadosAtualizacao: any): Promise<Local> {
    const local = await prisma.local.findUnique({ where: { localId: id } });

    if (!local) {
      throw new Error("Local não encontrado.");
    }

    const usuarioId = dadosAtualizacao?.usuarioId ? Number(dadosAtualizacao.usuarioId) : null;

    if (usuarioId && local.usuarioId && Number(local.usuarioId) !== usuarioId) {
      throw new Error("Você não tem permissão para atualizar este local.");
    }

    let emailResponsavel =
      normalizeString(dadosAtualizacao.emailResponsavel) ??
      normalizeString(dadosAtualizacao.emailContato) ??
      normalizeString(local.emailResponsavel);

    if (!emailResponsavel && usuarioId) {
      const usuarioPerfil = await prisma.usuario.findUnique({
        where: { usuarioId },
        select: { email: true },
      });
      emailResponsavel = normalizeString(usuarioPerfil?.email);
    }

    const imagensAtualizacao = Array.isArray(dadosAtualizacao.imagens)
      ? dadosAtualizacao.imagens
      : Array.isArray(dadosAtualizacao.produtos)
        ? dadosAtualizacao.produtos
        : Array.isArray(dadosAtualizacao.portfolio)
          ? dadosAtualizacao.portfolio
          : undefined;

    const atualizacaoLimpa = {
      ...dadosAtualizacao,
      nomeLocal: normalizeString(dadosAtualizacao.nomeLocal),
      categoria: normalizeString(dadosAtualizacao.categoria),
      nomeResponsavel: normalizeString(dadosAtualizacao.nomeResponsavel) ?? normalizeString(local.nomeResponsavel),
      cpfResponsavel: normalizeString(dadosAtualizacao.cpfResponsavel) ?? normalizeString(local.cpfResponsavel),
      emailResponsavel,
      contatoResponsavel:
        normalizeString(dadosAtualizacao.contatoResponsavel) ?? normalizeString(local.contatoResponsavel),
      contatoLocal: normalizeString(dadosAtualizacao.contatoLocal),
      endereco: normalizeString(dadosAtualizacao.endereco),
      descricao: normalizeString(dadosAtualizacao.descricao),
      instagram: normalizeString(dadosAtualizacao.instagram),
      latitude: parseOptionalNumber(dadosAtualizacao.latitude),
      longitude: parseOptionalNumber(dadosAtualizacao.longitude),
      logoUrl: normalizeString(dadosAtualizacao.logoUrl),
      alvaraFuncionamentoUrl: normalizeString(dadosAtualizacao.alvaraFuncionamentoUrl),
      alvaraVigilanciaUrl: normalizeString(dadosAtualizacao.alvaraVigilanciaUrl),
      imagens: Array.isArray(imagensAtualizacao)
        ? imagensAtualizacao.filter((img: any) => !!normalizeString(img))
        : undefined,
    };

    return prisma.local.update({
      where: { localId: id },
      data: {
        status: StatusLocal.pendente_atualizacao,
        dadosAtualizacao: atualizacaoLimpa,
      },
    });
  }

  public async solicitarExclusao(id: number, dadosExclusao: any): Promise<void> {
    const local = await prisma.local.findUnique({ where: { localId: id } });

    if (!local) {
      throw new Error("Local não encontrado.");
    }

    await prisma.local.update({
      where: { localId: id },
      data: {
        status: StatusLocal.pendente_exclusao,
        dadosAtualizacao: dadosExclusao,
      },
    });
  }

  public async listarTodos(): Promise<Local[]> {
    return prisma.local.findMany({
      where: { status: StatusLocal.ativo },
      include: {
        locaisImg: { select: { url: true } },
      },
    });
  }

  public async buscarPorCategoria(categoria: string): Promise<Local[]> {
    return prisma.local.findMany({
      where: {
        categoria: { contains: categoria },
        status: StatusLocal.ativo,
      },
      include: {
        locaisImg: { select: { url: true } },
      },
    });
  }

  public async buscarPorNome(nome: string): Promise<Local[]> {
    return prisma.local.findMany({
      where: {
        nomeLocal: { contains: nome },
        status: StatusLocal.ativo,
      },
      include: {
        locaisImg: { select: { url: true } },
      },
    });
  }

  public async buscarPorId(id: number): Promise<Local | null> {
    try {
      const local = await prisma.local.findFirst({
        where: {
          localId: id,
          status: StatusLocal.ativo,
        },
      });

      if (!local) {
        return null;
      }

      const imagens = await prisma.imagemLocal.findMany({
        where: { localId: local.localId },
        select: { url: true },
      });

      const avaliacoes = await prisma.avaliacao.findMany({
        where: {
          localId: local.localId,
          parentId: null,
        },
        include: {
          usuario: { select: { nomeCompleto: true, usuarioId: true, username: true } },
          respostas: {
            include: {
              usuario: { select: { nomeCompleto: true, usuarioId: true, username: true } },
            },
            orderBy: { avaliacoesId: "asc" },
          },
        },
        orderBy: { avaliacoesId: "desc" },
      });

      const localJSON: any = { ...local };
      localJSON.locaisImg = imagens;
      localJSON.avaliacoes = avaliacoes;

      if (avaliacoes && avaliacoes.length > 0) {
        const notasPrincipais = avaliacoes.map((a) => a.nota).filter((n) => n !== null) as number[];

        if (notasPrincipais.length > 0) {
          const somaDasNotas = notasPrincipais.reduce((acc, nota) => acc + nota, 0);
          localJSON.media = parseFloat((somaDasNotas / notasPrincipais.length).toFixed(1));
        } else {
          localJSON.media = 0;
        }
      } else {
        localJSON.media = 0;
      }

      return localJSON as Local;
    } catch (error) {
      console.error("[LocalService] Erro ao buscarPorId:", error);
      throw error;
    }
  }

  public async alterarStatusAtivo(id: number, ativo: boolean): Promise<Local> {
    const local = await prisma.local.findUnique({ where: { localId: id } });
    if (!local) {
      throw new Error("Local não encontrado.");
    }

    // quando admin desativa manualmente, marque como INATIVO (não REJEITADO)
    const status = ativo === false ? StatusLocal.inativo : StatusLocal.ativo;

    return prisma.local.update({
      where: { localId: id },
      data: { ativo, status },
    });
  }

  public async listarPendentes(): Promise<{
    cadastros: Local[];
    atualizacoes: Local[];
    exclusoes: Local[];
  }> {
    const include = {
      locaisImg: { select: { url: true } },
    } as const;

    const cadastros = await prisma.local.findMany({
      where: { status: StatusLocal.pendente_aprovacao },
      include,
    });

    const atualizacoes = await prisma.local.findMany({
      where: { status: StatusLocal.pendente_atualizacao },
      include,
    });

    const exclusoes = await prisma.local.findMany({
      where: { status: StatusLocal.pendente_exclusao },
      include,
    });

    return { cadastros, atualizacoes, exclusoes };
  }

  public async listarInativos(): Promise<Local[]> {
    return prisma.local.findMany({
      where: { status: StatusLocal.inativo },
      include: {
        locaisImg: { select: { url: true } },
      },
    });
  }
}

export default new LocalService();
