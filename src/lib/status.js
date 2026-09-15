/**
 * TRADUÇÃO DE STATUS DO AGENDAMENTO → UI.
 *
 * IMPORTANTE: os valores internos do backend NÃO mudam (contrato mantido):
 *   'agendado' | 'publicando' | 'publicado' | 'erro'  (+ 'cancelado' quando a
 *   Fase 2 introduzir o cancelamento lógico).
 * Esta camada existe só para traduzir para os rótulos do produto:
 *   PRONTO | PROGRAMADO | PUBLICANDO | PUBLICADO | ERRO | CANCELADO
 */
export const STATUS_UI = {
  agendado: 'programado',
  publicando: 'publicando',
  publicado: 'publicado',
  erro: 'erro',
  cancelado: 'cancelado',
};

/** Traduz um registro de agendamento para o estado visual da UI. */
export function statusUi(ag) {
  if (!ag) return 'pronto';
  return STATUS_UI[ag.status] || ag.status;
}

/** Ciclo de vida do vídeo exibido na Biblioteca. */
export const CICLO = ['pronto', 'programado', 'publicando', 'publicado'];

export const ROTULOS_CICLO = {
  pronto: 'PRONTO',
  programado: 'PROGRAMADO',
  publicando: 'PUBLICANDO',
  publicado: 'PUBLICADO',
  erro: 'ERRO',
  cancelado: 'CANCELADO',
};