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

export async function buscarFinal(id) {
  const r = await fetch(`${BASE_URL}/api/finais/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`Erro ao buscar final: ${r.status}`);
  return r.json();
}

export async function listarFinais(originalId) {
  const url = originalId
    ? `${BASE_URL}/api/finais?originalId=${encodeURIComponent(originalId)}`
    : `${BASE_URL}/api/finais`;
  const r = await fetch(url);
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

export async function processarLote(templateId, videos) {
  const r = await fetch(`${BASE_URL}/api/lote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId, videos }),
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

export async function importarTemplateCanva({ nome, arquivoOverlay, corMarcadorTexto }) {
  const formData = new FormData();
  formData.append('nome', nome);
  formData.append('overlay', arquivoOverlay);
  if (corMarcadorTexto) formData.append('corMarcadorTexto', corMarcadorTexto);
  const r = await fetch(`${BASE_URL}/api/templates/importar-canva`, { method: 'POST', body: formData });
  return r.json();
}

export async function listarAgendamentos() {
  const r = await fetch(`${BASE_URL}/api/agendamentos`);
  return r.json();
}

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
  await fetch(`${BASE_URL}/api/agendamentos/${id}`, { method: 'DELETE' });
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

export async function conectarInstagram(accessToken, igUserId) {
  const r = await fetch(`${BASE_URL}/api/contas/instagram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, igUserId }),
  });
  return r.json();
}

export async function desconectarConta(plataforma) {
  await fetch(`${BASE_URL}/api/contas/${plataforma}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// EDITOR EM LOTE — template da config compartilhada (POST /api/templates,
// multipart). A importação de vídeos usa SOMENTE arquivos locais via
// POST /api/upload (enviarVideos).
// ---------------------------------------------------------------------------

/**
 * Salva a config COMPARTILHADA do Editor em Lote como TEMPLATE no servidor
 * (POST /api/templates — multipart). Cria um template novo ou atualiza o
 * existente quando `templateId` é passado. A logo (arquivo) é opcional: sem
 * ela, o servidor mantém a logo já salva do template.
 */
export async function salvarTemplateDoEditor({ payload, arquivoLogo = null, templateId = null }) {
  const formData = new FormData();
  if (templateId) formData.append('id', templateId);
  formData.append('nome', payload.nome);
  formData.append('corFundo', payload.corFundo);
  formData.append('canvasLargura', String(payload.canvasLargura));
  formData.append('canvasAltura', String(payload.canvasAltura));
  formData.append('areaVideo', JSON.stringify(payload.areaVideo));
  if (payload.logoPosicao) formData.append('logoPosicao', payload.logoPosicao);
  // Sempre envia AMBOS textos (superior + inferior) — incluso null — para que
  // o servidor limpie valores obsoletos quando o usuário esvazia um bloco.
  formData.append('texto', JSON.stringify(payload.texto || null));
  formData.append('textoInferior', JSON.stringify(payload.textoInferior || null));
  // IDENTIDADE DO CANAL (nome, @ e selo azul) — sempre envia (mesmo null) pra
  // que o servidor limpe valores obsoletos quando o usuário desliga um
  // elemento. Templates antigos, sem esses campos, chegam null e o pipeline
  // simplesmente pula (nada muda no fluxo antigo de Templates).
  formData.append('identidadeNome', JSON.stringify(payload.identidadeNome || null));
  formData.append('identidadeUsuario', JSON.stringify(payload.identidadeUsuario || null));
  formData.append('identidadeSelo', JSON.stringify(payload.identidadeSelo || null));
  if (payload.corteBordas) formData.append('corteBordas', JSON.stringify(payload.corteBordas));
  if (arquivoLogo) formData.append('logo', arquivoLogo);

  const r = await fetch(`${BASE_URL}/api/templates`, { method: 'POST', body: formData });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok || corpo.erro) throw new Error(corpo.erro || `Erro ao salvar o template do lote: ${r.status}`);
  return corpo; // template criado/atualizado
}
