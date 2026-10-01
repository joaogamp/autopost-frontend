export const BASE_URL = 'https://autopostjoao.duckdns.org';

export async function buscarBiblioteca() {
  const r = await fetch(`${BASE_URL}/api/biblioteca`);
  if (!r.ok) throw new Error(`Erro ao buscar biblioteca: ${r.status}`);
  return r.json();
}

export async function excluirVideo(id) {
  const r = await fetch(`${BASE_URL}/api/biblioteca/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.erro || `Erro ao excluir vídeo: ${r.status}`);
  return corpo;
}

/**
 * EXCLUI TODOS OS VÍDEOS DA BIBLIOTECA — DELETE /api/biblioteca (SEM id).
 *
 * A remoção real é do BACKEND: originais (uploads), finais (publicados),
 * thumbnails, pastas temporárias e os registros dos stores da Biblioteca.
 * Templates, configurações do Editor e agendamentos ATIVOS (programado/
 * publicando/publicado) NÃO são tocados: os vídeos protegidos por eles voltam
 * em `preservados` com o motivo. Biblioteca vazia responde 200 com
 * `nadaAExcluir: true` (nunca erro).
 */
export async function excluirTodosOsVideos() {
  const r = await fetch(`${BASE_URL}/api/biblioteca`, { method: 'DELETE' });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.erro || `Erro ao excluir todos os vídeos: ${r.status}`);
  return corpo;
}

export async function buscarFinal(id) {
  const r = await fetch(`${BASE_URL}/api/finais/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`Erro ao buscar final: ${r.status}`);
  return r.json();
}

export async function listarFinais(originalId, { operacionais = false } = {}) {
  const params = new URLSearchParams();
  if (originalId) params.set('originalId', originalId);
  if (operacionais) params.set('operacionais', '1');
  const query = params.toString();
  const r = await fetch(`${BASE_URL}/api/finais${query ? `?${query}` : ''}`);
  if (!r.ok) throw new Error(`Erro ao buscar finais: ${r.status}`);
  return r.json();
}

export async function buscarFila() {
  const r = await fetch(`${BASE_URL}/api/fila`);
  if (!r.ok) throw new Error(`Erro ao buscar fila: ${r.status}`);
  return r.json();
}

export async function enviarVideos(arquivos) {
  const formData = new FormData();
  for (const arquivo of arquivos) formData.append('videos', arquivo);
  const r = await fetch(`${BASE_URL}/api/upload`, { method: 'POST', body: formData });
  if (!r.ok) {
    const corpo = await r.json().catch(() => ({}));
    throw new Error(corpo.erro || `Erro no upload: ${r.status}`);
  }
  return r.json();
}

/**
 * Enfileira um lote na fila REAL (POST /api/lote).
 *
 * NOVA ARQUITETURA DO EDITOR EM LOTE: a configuração do Editor viaja JUNTO
 * com a fila, em `configTemplate` (o MESMO objeto produzido por
 * configParaTemplatePayload()). Ela NÃO é salva como template no servidor, não
 * vira entidade permanente e não é buscada em /api/templates/:id — existe só
 * enquanto for necessária para produzir o vídeo.
 *
 * Um POST por GRUPO de corte/assinatura: como o Editor agrupa vídeos que
 * compartilham a mesma configuração, o corpo é enviado uma vez por grupo
 * (e a mesma config é gravada nas linhas do grupo), em vez de repetir a config
 * no body de cada vídeo.
 *
 * `templateId` NÃO é enviado por este fluxo: a configuração do job é o que o
 * worker renderiza (o servidor ainda aceita `templateId` no corpo para o fluxo
 * legado de templates, que continua intacto).
 */
export async function processarLote(configTemplate, videos) {
  // CONTRATO ATUAL (fluxo Editor em duas fases): videos = [{ bibliotecaId,
  // tituloIA }]. Bloqueia payload inválido ANTES do fetch — nenhuma fila pode
  // nascer com biblioteca_id NULL (o worker rejeitaria em
  // POST /api/finais/receber-processado e o MP4 seria descartado).
  if (!configTemplate || typeof configTemplate !== 'string' || !configTemplate.trim()) {
    throw new Error('A configuração do Editor é obrigatória para processar o lote.');
  }
  if (!Array.isArray(videos) || videos.length === 0) {
    throw new Error('videos[] é obrigatório e não pode estar vazio.');
  }
  const invalidos = [];
  videos.forEach((v, i) => {
    if (!v || typeof v.bibliotecaId !== 'string' || !v.bibliotecaId.trim()) invalidos.push(i);
  });
  if (invalidos.length > 0) {
    // eslint-disable-next-line no-console
    console.error('[processarLote] vídeos sem bibliotecaId válido (índices):', invalidos, videos);
    throw new Error(
      `bibliotecaId é obrigatório em cada vídeo (inválidos: ${invalidos.join(', ')}). POST /api/lote não enviado.`
    );
  }
  const r = await fetch(`${BASE_URL}/api/lote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // `configTemplate` já é uma STRING JSON (vinda de JSON.stringify do
    // payload). Ela viaja como string, e não como objeto aninhado, para não
    // pagar uma segunda camada de escape de aspas no corpo.
    body: JSON.stringify({ configTemplate, videos }),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.erro || `Erro ao processar lote: ${r.status}`);
  return corpo;
}

export function urlArquivo(caminhoRelativo) {
  if (!caminhoRelativo) return null;
  return `${BASE_URL}${caminhoRelativo}`;
}

export async function listarTemplates() {
  const r = await fetch(`${BASE_URL}/api/templates`);
  return r.json();
}

export async function salvarTemplate(dados, arquivoLogo) {
  const formData = new FormData();
  Object.entries(dados).forEach(([chave, valor]) => {
    if (valor === null || valor === undefined) return;
    formData.append(chave, typeof valor === 'object' ? JSON.stringify(valor) : valor);
  });
  if (arquivoLogo) formData.append('logo', arquivoLogo);

  const r = await fetch(`${BASE_URL}/api/templates`, { method: 'POST', body: formData });
  return r.json();
}

export function urlPreviewTemplate(id) {
  return `${BASE_URL}/api/templates/${id}/preview.png?t=${Date.now()}`;
}

export async function excluirTemplate(id) {
  await fetch(`${BASE_URL}/api/templates/${id}`, { method: 'DELETE' });
}

export async function importarTemplateCanva({ nome, arquivoOverlay, corMarcadorTexto, corMarcadorVideo }) {
  const formData = new FormData();
  formData.append('nome', nome);
  formData.append('overlay', arquivoOverlay);
  if (corMarcadorTexto) formData.append('corMarcadorTexto', corMarcadorTexto);
  // Marcador do VÍDEO: retângulo sólido desenhado pelo usuário (padrão #00FF00).
  if (corMarcadorVideo) formData.append('corMarcadorVideo', corMarcadorVideo);
  const r = await fetch(`${BASE_URL}/api/templates/importar-canva`, { method: 'POST', body: formData });
  return r.json();
}

export async function listarAgendamentos() {
  const r = await fetch(`${BASE_URL}/api/agendamentos`);
  return r.json();
}

/**
 * Cria um agendamento (POST /api/agendamentos).
 * Body: { finalId?, bibliotecaId?, redes, data, horario, legenda? }
 * NOTA Fase 1: `legenda` é coletada na UI e enviada no body, mas o backend
 * ainda NÃO persiste nem usa esse campo — só na Fase 2.
 */
export async function criarAgendamento(dados) {
  const r = await fetch(`${BASE_URL}/api/agendamentos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.erro || `Erro ao criar agendamento: ${r.status}`);
  return corpo;
}

export async function cancelarAgendamento(id) {
  const r = await fetch(`${BASE_URL}/api/agendamentos/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!r.ok) {
    const corpo = await r.json().catch(() => ({}));
    throw new Error(corpo.erro || `Erro ao cancelar agendamento: ${r.status}`);
  }
}

/**
 * EXCLUI um FINAL (PRONTO ou ERRO) — DELETE /api/finais/:id.
 * PROGRAMADO/PUBLICANDO/PUBLICADO retornam 409 com mensagem orientativa.
 * Idempotente: repetir devolve { ok:true, jaExistia:true }.
 */
export async function excluirFinal(id) {
  const r = await fetch(`${BASE_URL}/api/finais/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.erro || `Erro ao excluir vídeo: ${r.status}`);
  return corpo;
}

/**
 * REMOVE um item da fila — DELETE /api/fila/:id.
 * aguardando/concluido/erro: remove; processando: 409.
 * Idempotente: repetir devolve { ok:true, jaExistia:true }.
 */
export async function excluirItemFila(id) {
  const r = await fetch(`${BASE_URL}/api/fila/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.erro || `Erro ao excluir item da fila: ${r.status}`);
  return corpo;
}

/**
 * PRÉVIA do agendamento em lote (POST /api/agendamentos/lote com dryRun:true).
 * NÃO grava nada — o backend monta o plano e devolve `{ resumo, plano }`.
 * Body: { horarios, videosPorDia, dataInicio, redes, finalIds? }
 */
export async function previaAgendamentoLote(config) {
  const r = await fetch(`${BASE_URL}/api/agendamentos/lote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...config, dryRun: true }),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.erro || `Erro ao montar a prévia: ${r.status}`);
  return corpo;
}

/**
 * SALVA o agendamento em lote enviando EXATAMENTE os `itens` da prévia
 * (mesmo finalId, mesma data, mesmo horário) — o que foi conferido na tela é
 * o que é gravado. `idempotencyKey` impede duplicação em duplo clique/retry.
 * `contexto` (horarios/videosPorDia/dataInicio da prévia) é reenviado para
 * que o `resumo` da resposta do save use o MESMO contexto da prévia; a
 * gravação em si usa só `itens` (nunca recalcula datas/horários).
 */
export async function salvarAgendamentoLote({ itens, redes, idempotencyKey, contexto }) {
  const r = await fetch(`${BASE_URL}/api/agendamentos/lote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itens, redes, idempotencyKey, ...(contexto || {}) }),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detalhes = Array.isArray(corpo.conflitos)
      ? ` (${corpo.conflitos.slice(0, 3).map((c) => c.motivo).join('; ')})`
      : '';
    throw new Error((corpo.erro || `Erro ao salvar o agendamento: ${r.status}`) + detalhes);
  }
  return corpo;
}

/**
 * REMARCAÇÃO (Fase 1) — usa criar+cancelar porque o backend ainda não tem
 * PATCH /api/agendamentos/:id. A assinatura já é a da Fase 2: quando o PATCH
 * existir, trocar SOMENTE esta implementação (as telas não mudam).
 * Falha explícita se o antigo não puder ser removido, para evitar publicação
 * duplicada silenciosa.
 */
export async function remarcarAgendamento(agendamentoAntigo, { data, horario }) {
  const criado = await criarAgendamento({
    finalId: agendamentoAntigo.finalId || undefined,
    bibliotecaId: agendamentoAntigo.finalId ? undefined : agendamentoAntigo.bibliotecaId,
    redes: agendamentoAntigo.redes && agendamentoAntigo.redes.length > 0 ? agendamentoAntigo.redes : ['instagram'],
    data,
    horario,
  });
  try {
    await cancelarAgendamento(agendamentoAntigo.id);
  } catch {
    throw new Error(
      'Remarcado, mas o agendamento antigo não pôde ser removido — cancele-o manualmente para evitar publicação duplicada.'
    );
  }
  return criado;
}

export async function buscarRegraPublicacao() {
  const r = await fetch(`${BASE_URL}/api/regra-publicacao`);
  return r.json();
}

export async function salvarRegraPublicacao(regra) {
  const r = await fetch(`${BASE_URL}/api/regra-publicacao`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(regra),
  });
  return r.json();
}

export async function buscarContas() {
  const r = await fetch(`${BASE_URL}/api/contas`);
  return r.json();
}

/**
 * Conecta a conta do Instagram. O `igUserId` é OPCIONAL: sem ele o backend
 * descobre sozinho as contas que o token acessa — e responde
 * { requerSelecao: true, contas: [...] } quando houver mais de uma.
 */
export async function conectarInstagram(accessToken, igUserId) {
  const r = await fetch(`${BASE_URL}/api/contas/instagram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, ...(igUserId ? { igUserId } : {}) }),
  });
  return r.json();
}

/** Só DESCOBRE as contas que o token acessa (nada é salvo). */
export async function descobrirContasInstagram(accessToken) {
  const r = await fetch(`${BASE_URL}/api/contas/instagram/descobrir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  });
  return r.json();
}

export async function desconectarConta(plataforma) {
  await fetch(`${BASE_URL}/api/contas/${plataforma}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// EDITOR EM LOTE — a configuração NÃO é mais salva como template.
//
// TRANSPORTE ATUAL: a config do Editor viaja DENTRO do POST /api/lote (campo
// `configTemplate`, ver `processarLote` acima). A Oracle grava essa config
// associada ao JOB que vai renderizá-lo (output/jobs/<filaId>.json) e o worker
// local a busca em GET /api/fila/:filaId/config — não existe registro
// permanente, nem em templates-store.json, nem em /api/templates.
//
// A antiga `salvarTemplateDoEditor` (POST /api/templates multipart) foi
// removida: era o transporte ANTERIOR do Editor em Lote e ficou sem nenhum
// chamador depois da mudança. Os endpoints /api/templates e o fluxo da página
// Templates continuam intactos no servidor (ver servidor.js) e seguem usados
// por `listarTemplates`/`salvarTemplate`/`urlPreviewTemplate`/`excluirTemplate`.
//
// A importação de vídeos usa SOMENTE arquivos locais via POST /api/upload
// (enviarVideos).
// ---------------------------------------------------------------------------
