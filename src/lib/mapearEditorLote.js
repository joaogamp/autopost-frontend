import { BASE_URL } from './api';

/**
 * EDITOR EM LOTE — conversão da config COMPARTILHADA (%) para o payload do
 * template do servidor (px do canvas). É EXATAMENTE o formato que o
 * POST /api/templates e o pipeline (Oracle + worker local) consomem, então a
 * prévia do canvas e o render final ficam idênticos.
 */

export const NOME_TEMPLATE_LOTE = 'Editor em Lote · config compartilhada';

export function configParaTemplatePayload(config) {
  const { canvas, areaVideo, logo, texto, corteBordas } = config;

  const sup = Math.min(90, Math.max(0, Number(corteBordas?.superior) || 0));
  const inf = Math.min(90 - sup, Math.max(0, Number(corteBordas?.inferior) || 0));

  let logoPosicao = null;
  if (logo.visivel && logo.url) {
    const larguraPx = Math.max(1, Math.round((logo.largura / 100) * canvas.largura));
    const proporcao = Number(logo.alturaProporcao) > 0 ? Number(logo.alturaProporcao) : 0.4;
    const alturaPx = Math.max(1, Math.round(larguraPx * proporcao));
    logoPosicao = {
      // A prévia usa x% como CENTRO (translate(-50%, 0)); o template espera a
      // borda ESQUERDA em px — desloca metade da largura.
      x: Math.round((logo.x / 100) * canvas.largura - larguraPx / 2),
      y: Math.round((logo.y / 100) * canvas.altura),
      largura: larguraPx,
      altura: alturaPx,
      // Opacidade só vai pro template quando < 100 (backend aplica só o alfa).
      ...(Number(logo.opacidade) > 0 && Number(logo.opacidade) < 100
        ? { opacidade: Math.round(logo.opacidade) }
        : {}),
    };
  }

  let textoArea = null;
  if (texto.visivel && texto.conteudo.trim() !== '') {
    const larguraPx = Math.max(1, Math.round((texto.largura / 100) * canvas.largura));
    textoArea = {
      // Novo fluxo: o CONTENIDO viaja dentro do template (`texto.contenido`),
      // junto com fonte/peso/alinheamento. Não se usa tituloIA aqui.
      contenido: texto.conteudo,
      fonte: texto.fonte,
      peso: texto.peso,
      alinhamento: texto.alinhamento,
      // Área centrada no x% e com o TOPO em y% (alinhamentoVertical 'topo' —
      // igual à prévia). A altura comporta ~2 linhas antes do pipeline reduzir
      // a fonte automaticamente (comportamento real do renderizador).
      x: Math.round((texto.x / 100) * canvas.largura - larguraPx / 2),
      y: Math.round((texto.y / 100) * canvas.altura),
      largura: larguraPx,
      altura: Math.max(40, Math.round(texto.altura || 240)),
      tamanhoFonte: Math.round(texto.tamanho),
      cor: texto.cor,
      alinhamentoVertical: 'topo',
      ...(Number(texto.opacidade) > 0 && Number(texto.opacidade) < 100
        ? { opacidade: Math.round(texto.opacidade) }
        : {}),
    };
  }

  return {
    nome: NOME_TEMPLATE_LOTE,
    corFundo: canvas.corFundo,
    canvasLargura: canvas.largura,
    canvasAltura: canvas.altura,
    areaVideo: {
      x: areaVideo.x,
      y: areaVideo.y,
      largura: areaVideo.largura,
      altura: areaVideo.altura,
      fit: areaVideo.fit === 'ajustar' ? 'ajustar' : 'cobrir',
      detectarContenido: false,
    },
    // Corte de bordas compartilhado (single-pass no FFmpeg). Padrão guardado
    // também quando inactivo pra que o template no servidor nunca fique
    // obsoleto. Nome unificado `corteBordas` (front + back).
    corteBordas: {
      ativo: !!corteBordas?.ativo,
      superior: sup,
      inferior: inf,
    },
    // null → o campo NÃO é enviado e o servidor limpa a logo do template.
    logoPosicao: logoPosicao ? JSON.stringify(logoPosicao) : null,
    texto: textoArea,
  };
}

/** Assinatura estável da config (evita re-salvar o template sem mudança). */
export function assinarConfig(config) {
  return JSON.stringify(configParaTemplatePayload(config)) + (config.logo.arquivo ? '|logo-arquivo' : '');
}

/**
 * Firma de la COMPOSICIÓN visible (área + corte + logo + texto + fondo).
 * Serve às tarjetas de preview do centro: quando a firma não muda, os cards
 * memoizados NÃO re-renderizan (performance com muitos vídeos).
 */
export function firmaComposicion(config) {
  const { canvas, areaVideo, logo, texto, corteBordas } = config;
  return [
    'c1',
    canvas.corFundo,
    areaVideo.x, areaVideo.y, areaVideo.largura, areaVideo.altura, areaVideo.fit, areaVideo.mostrarMarcacao,
    corteBordas?.ativo ? 1 : 0, Math.round(corteBordas?.superior || 0), Math.round(corteBordas?.inferior || 0),
    logo.visivel ? 1 : 0, Math.round(logo.x), Math.round(logo.y), Math.round(logo.largura),
    Math.round(logo.opacidade || 100), logo.url ? 't' : 'f',
    Math.round(Number(logo.alturaProporcao || 0) * 1000),
    texto.visivel ? 1 : 0, texto.conteudo, texto.fonte, texto.peso, texto.alinhamento,
    Math.round(texto.tamanho), Math.round(texto.x), Math.round(texto.y),
    Math.round(texto.largura), Math.round(texto.altura), Math.round(texto.opacidade || 100), texto.cor,
  ].join('|');
}

/** URL pública estável da logo salva no servidor (a mesma que o worker baixa). */
export function urlLogoDoTemplate(template) {
  if (!template) return null;
  if (template.logo?.url && /^https?:\/\//.test(template.logo.url)) return template.logo.url;
  const caminho = template.logo?.caminhoArquivo;
  if (!caminho) return null;
  const nome = String(caminho).split(/[\\/]+/).pop();
  return `${BASE_URL}/arquivos/logos-templates/${encodeURIComponent(nome)}`;
}

/** Proporção (altura/largura) da imagem da logo, carregada sob demanda. */
export function proporcaoDaImagem(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}