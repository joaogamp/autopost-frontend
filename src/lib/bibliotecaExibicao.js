/**
 * BIBLIOTECA — FUNÇÕES DE EXIBIÇÃO (puras, sem React).
 *
 * Vivem fora da página porque são regras de DADO, não de layout: descrevem
 * como o texto gravado pelo backend vira rótulo na tela (descrição, hashtags,
 * duração, id curto, data) e como os estados viram a contagem dos filtros.
 *
 * Extrair para cá NÃO muda comportamento nenhum: o código é o mesmo que
 * estava em Biblioteca.jsx, e a página agora só importa estas funções.
 * O benefício é que a lógica passa a ser testável de verdade
 * (ver teste_biblioteca_detalhes.mjs), em vez de testada por cópia.
 */

/** Nome do template p/ EXIBIÇÃO: 'undefined' (templates salvos com o bug antigo)
 * e vazio viram um rótulo neutro — os dados no servidor NÃO são alterados. */
export function templateExibicao(nome) {
  const t = String(nome || '').trim();
  return !t || t.toLowerCase() === 'undefined' ? 'Editor em Lote' : t;
}

/** Id curto estável: a ÚNICA forma confiável de distinguir cópias homônimas
 * (o downloader em massa gera vários arquivos com o MESMO nome de legenda e,
 * às vezes, CONTEÚDO diferente — o nome sozinho não identifica o vídeo). */
export function idCurto(id) {
  return id ? String(id).slice(0, 8) : '';
}

/** Data compacta (dd/mm hh:mm) do FINAL — distingue re-processamentos do mesmo original. */
export function dataCurta(iso) {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * DESCRIÇÃO (caption) da publicação — a MESMA que o backend grava em cada
 * agendamento (`descricao`, com `legenda` como apelido dos registros antigos;
 * ver src/descricao.js no engine). Ela PERTENCE ao agendamento, não ao vídeo:
 * num agendamento em lote o texto é idêntico para todos.
 *
 * O texto chega CRU do backend (hashtags, quebras de linha e emojis intactos) e
 * é exibido como está, com `whitespace-pre-wrap` — nunca remontado nem cortado.
 */
export function descricaoDoAgendamento(ag) {
  if (!ag || typeof ag !== 'object') return '';
  const bruto = ag.descricao !== undefined ? ag.descricao : ag.legenda;
  return typeof bruto === 'string' ? bruto : '';
}

/** Hashtags presentes na descrição — extraídas do texto real, nunca inventadas. */
export function hashtagsDaDescricao(texto) {
  if (!texto) return [];
  const achadas = String(texto).match(/#[\p{L}\p{N}_]+/gu);
  return achadas ? Array.from(new Set(achadas)) : [];
}

/** Duração em segundos (metadado do ORIGINAL) → 'm:ss' / 'h:mm:ss'. */
export function duracaoTexto(segundos) {
  const total = Math.round(Number(segundos));
  if (!Number.isFinite(total) || total <= 0) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dois = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dois(m)}:${dois(s)}` : `${m}:${dois(s)}`;
}

/** Bytes → '1,2 MB' (tamanho real do original, exibido só nos detalhes). */
export function tamanhoLegivel(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  const mb = n / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Orientações de exclusão por estado — mesma regra de sempre, texto sob demanda. */
export function orientacaoExclusao(estado) {
  if (estado === 'programado') {
    return 'Cancele na tela Agendamento antes de excluir — um vídeo programado não pode ser removido aqui.';
  }
  if (estado === 'publicando') return 'Este vídeo está sendo publicado. Gerencie na tela Agendamento.';
  if (estado === 'publicado') return 'Vídeo já publicado — veja o histórico de publicados ou gerencie no Agendamento.';
  if (estado === 'erro') return 'Falhou — exclua aqui ou reagende na tela Agendamento.';
  if (estado === 'cancelado') return 'Agendamento cancelado — gerencie na tela Agendamento.';
  return 'Pronto para agendar — você pode excluí-lo ou enviá-lo ao Agendamento.';
}

/**
 * CONTAGEM por estado — base dos números exibidos nos filtros.
 *
 * Cobre só os estados que a UI de fato oferece como filtro
 * (todos/pronto/programado/publicando/erro). PUBLICADO sai da grade operacional
 * e vive no histórico; CANCELADO não é um filtro da tela. Qualquer estado novo
 * ainda é contabilizado, sem quebrar a contagem dos filtros existentes.
 */
export function contagemPorEstado(itens) {
  const c = { todos: itens.length, pronto: 0, programado: 0, publicando: 0, erro: 0 };
  for (const it of itens) c[it.estado] = (c[it.estado] || 0) + 1;
  return c;
}