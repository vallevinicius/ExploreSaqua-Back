import prisma from '../prisma';

class VisitService {

  private static determineTag(percentage: number): string {
    const buckets = [
      'Iniciante',
      'Turista',
      'Viajante',
      'Explorador',
      'Aventureiro',
      'Conhecedor',
      'Especialista',
      'Veterano',
      'Expert',
      'Lendário',
      'Mestre',
    ];

    const idx = Math.min(10, Math.floor(percentage / 10));
    return buckets[idx];
  }

  /** Monta objeto de update do usuário de forma extensível */
  private static buildProgressUpdate(payload: { percentage: number; tag: string; extras?: Record<string, any> }) {
    const updateObj: Record<string, any> = {
      progressPercentage: Number(payload.percentage.toFixed(2)),
      currentTag: payload.tag,
    };

    if (payload.extras) Object.assign(updateObj, payload.extras);

    return updateObj;
  }

  public static async markVisited(userId: number, localId: number) {
    // Verifica existência do usuário
    const user = await prisma.usuario.findUnique({ where: { usuarioId: userId } });
    if (!user) return { status: 404, body: { message: 'Usuário não encontrado' } };

    // Verifica existência do local
    const local = await prisma.local.findUnique({ where: { localId } });
    if (!local) return { status: 404, body: { message: 'Local não encontrado' } };

    // Transação para garantir consistência ao criar visita e atualizar progresso
    const result = await prisma.$transaction(async (tx) => {
      // Cria ou atualiza registro de visita (evita duplicatas)
      const existing = await tx.usuarioLocal.findFirst({ where: { usuarioId: userId, localId } });

      if (existing) {
        // Se já existia, atualiza visitedAt
        await tx.usuarioLocal.update({
          where: { id: existing.id },
          data: { visitedAt: new Date() },
        });
      } else {
        await tx.usuarioLocal.create({ data: { usuarioId: userId, localId } });
      }

      // Conta total de locais visitados pelo usuário
      const visitedCount = await tx.usuarioLocal.count({ where: { usuarioId: userId } });

      // Conta total de locais ativos no sistema (usa campo 'ativo' do model)
      const totalActiveLocations = await tx.local.count({ where: { ativo: true } });

      // Calcula porcentagem (tratamento divisão por zero)
      let percentage = 0;
      if (totalActiveLocations > 0) {
        percentage = (visitedCount / totalActiveLocations) * 100;
      }
      if (!isFinite(percentage) || Number.isNaN(percentage)) percentage = 0;

      // Determina tag
      const tag = VisitService.determineTag(percentage);

      // Monta objeto de update extensível
      const updateObj = VisitService.buildProgressUpdate({ percentage, tag });

      // Atualiza usuário
      await tx.usuario.update({ where: { usuarioId: userId }, data: updateObj });

      return { visitedCount, totalActiveLocations, percentage, tag };
    });

    return {
      status: 200,
      body: {
        message: 'Visita registrada e progresso atualizado',
        visitedCount: result.visitedCount,
        totalActiveLocations: result.totalActiveLocations,
        progressPercentage: Number(result.percentage.toFixed(2)),
        currentTag: result.tag,
      },
    };
  }
}

export default VisitService;
