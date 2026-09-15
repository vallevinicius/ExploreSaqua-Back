/**
 * Lê uma variável de ambiente obrigatória. Derruba o processo no boot (fail-fast)
 * em vez de continuar rodando com um segredo hardcoded/adivinhável no código.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
  }
  return value;
}
