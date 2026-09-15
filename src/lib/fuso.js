/**
 * FUSO HORÁRIO DA INTERFACE — o usuário agenda e lê horários em America/Sao_Paulo
 * (mesmo fuso adotado pelo backend). Nunca use o fuso do navegador para decidir
 * qual dia é "hoje": computadores fora de Brasília divergiriam do servidor.
 */
export const FUSO = 'America/Sao_Paulo';
export const ROTULO_FUSO = 'Horário de Brasília';

/** Data de hoje em America/Sao_Paulo no formato YYYY-MM-DD. */
export function hojeIso() {
  const m = {};
  for (const x of new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())) {
    m[x.type] = x.value;
  }
  return `${m.year}-${m.month}-${m.day}`;
}

/** 'YYYY-MM-DD' -> 'dd/mm/aaaa' (para exibição). */
export function formatarData(dataIso) {
  const v = String(dataIso || '').split('-');
  return v.length === 3 ? `${v[2]}/${v[1]}/${v[0]}` : String(dataIso || '');
}