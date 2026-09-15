import prisma from '../prisma';
import { StatusLocal } from '@prisma/client';

class ProgressService {
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

  public static async getUserProgress(userId: number) {
    // Verificar se usuário existe
    const user = await prisma.usuario.findUnique({ where: { usuarioId: userId } });
    if (!user) {
      return { status: 404, body: { message: 'Usuário não encontrado' } };
    }

    // Contar locais ativos no sistema (status = ATIVO)
    const totalLocations = await prisma.local.count({ where: { status: StatusLocal.ativo } });

    // Contar locais visitados pelo usuário (contagem distinta de localId)
    const visitedRows = await prisma.usuarioLocal.findMany({
      where: { usuarioId: userId },
      distinct: ['localId'],
      select: { localId: true },
    });
    const visitedCount = visitedRows.length;

    // Tratar divisão por zero
    if (totalLocations === 0) {
      const percentage = 0;
      const tag = ProgressService.determineTag(percentage);
      return {
        status: 200,
        body: {
          userId,
          progressPercentage: percentage,
          visitedCount,
          totalLocations,
          tag,
        },
      };
    }

    const rawProgress = (visitedCount / totalLocations) * 100;
    // Arredondar para no máximo duas casas decimais
    let progressPercentage = Math.round(rawProgress * 100) / 100;
    // Garantir que o progresso máximo seja 100%
    if (progressPercentage > 100) progressPercentage = 100;

    const tag = ProgressService.determineTag(progressPercentage);

    return {
      status: 200,
      body: {
        userId,
        progressPercentage,
        visitedCount,
        totalLocations,
        tag,
      },
    };
  }
}

export default ProgressService;
