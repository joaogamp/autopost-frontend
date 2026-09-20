import { CANVAS_ALTURA, CANVAS_LARGURA, criarConfigPadrao } from './configEditorLote.js';
import { BASE_URL } from './api.js';

function num(v, padrao = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
}

function urlAbsolutaLogo(template) {
  if (!template) return null;
  if (template?.logo?.url && /^https?:\/\//.test(template.logo.url)) return template.logo.url;
  const caminho = template?.logo?.caminhoArquivo;
  if (typeof caminho === 'string' && caminho) {
    const nome = caminho.split(/[\\/]+/).pop();
    if (nome) return `${BASE_URL}/arquivos/logos-templates/${encodeURIComponent(nome)}`;
  }
  const rel = template?.logo?.url;
  if (typeof rel === 'string' && rel.startsWith('/')) return `${BASE_URL}${rel}`;
  return typeof rel === 'string' && rel ? rel : null;
}

function extrairLogoPx(template) {
  if (template?.logo && typeof template.logo.x === 'number') return template.logo;
  const lp = template?.logoPosicao;
  if (typeof lp === 'string') {
    try {
      const o = JSON.parse(lp);
      if (o && typeof o === 'object') return o;
    } catch { return null; }
  }
  if (lp && typeof lp === 'object') return lp;
  return null;
}

function textoSrvParaCfg(t, lc, ac, padrao) {
  if (!t || typeof t !== 'object') return { ...padrao, visivel: false, conteudo: '' };
  const conteudo = typeof t.contenido === 'string' ? t.contenido : '';
  const largPx = num(t.largura, 0);
  return {
    ...padrao,
    conteudo,
    visivel: conteudo.trim() !== '',
    x: largPx > 0 ? ((num(t.x) + largPx / 2) / lc) * 100 : padrao.x,
    y: typeof t.y === 'number' ? (t.y / ac) * 100 : padrao.y,
    largura: largPx > 0 ? (largPx / lc) * 100 : padrao.largura,
    altura: num(t.altura, padrao.altura),
    tamanho: num(t.tamanhoFonte, padrao.tamanho),
    cor: typeof t.cor === 'string' && t.cor ? t.cor : padrao.cor,
    fonte: typeof t.fonte === 'string' && t.fonte ? t.fonte : padrao.fonte,
    peso: typeof t.peso === 'string' && t.peso ? t.peso : padrao.peso,
    alinhamento: typeof t.alinhamento === 'string' && t.alinhamento ? t.alinhamento : padrao.alinhamento,
    opacidade: Number.isFinite(Number(t.opacidade)) ? Number(t.opacidade) : 100,
  };
}

export function templateParaConfigEditor(template, opts = {}) {
  const base = criarConfigPadrao();
  const loteId = opts.loteId || null;
  const loteCriadoEm = opts.loteCriadoEm || null;
  const preservar = (c) => {
    if (loteId) c.loteId = loteId;
    if (loteCriadoEm) c.loteCriadoEm = loteCriadoEm;
    return c;
  };
  if (!template || typeof template !== 'object') return preservar({ ...base });
  const lc = num(template.canvasLargura, CANVAS_LARGURA) || CANVAS_LARGURA;
  const ac = num(template.canvasAltura, CANVAS_ALTURA) || CANVAS_ALTURA;
  const area = template.areaVideo && typeof template.areaVideo === 'object' ? template.areaVideo : null;
  const temArea = !!(area && num(area.largura) > 0 && num(area.altura) > 0);
  const logoPx = extrairLogoPx(template);
  let logo = { ...base.logo, visivel: false, url: null, arquivo: null, logoDataUrl: null, alturaProporcao: null };
  if (logoPx && num(logoPx.largura) > 0 && num(logoPx.altura) > 0) {
    const largPx = num(logoPx.largura);
    logo = {
      ...logo, visivel: true, url: urlAbsolutaLogo(template),
      largura: (largPx / lc) * 100,
      x: ((num(logoPx.x) + largPx / 2) / lc) * 100,
      y: (num(logoPx.y) / ac) * 100,
      alturaProporcao: largPx > 0 ? num(logoPx.altura) / largPx : null,
      opacidade: Number.isFinite(Number(logoPx.opacidade)) ? Number(logoPx.opacidade) : 100,
    };
  }
  const seloSrv = template.identidadeSelo && typeof template.identidadeSelo === 'object' ? template.identidadeSelo : null;
  const selo = { ...base.identidade.selo, visivel: !!(seloSrv && seloSrv.visivel) };
  if (seloSrv && seloSrv.visivel) {
    const largPx = num(seloSrv.largura, 0);
    if (largPx > 0) {
      selo.x = (num(seloSrv.x) / lc) * 100;
      selo.y = (num(seloSrv.y) / ac) * 100;
      selo.largura = (largPx / lc) * 100;
    }
    if (typeof seloSrv.urlImagem === 'string' && seloSrv.urlImagem.startsWith('data:image/')) selo.urlImagem = seloSrv.urlImagem;
    if (Number(seloSrv.alturaProporcao) > 0) selo.alturaProporcao = Number(seloSrv.alturaProporcao);
    if (Number.isFinite(Number(seloSrv.opacidade))) selo.opacidade = Number(seloSrv.opacidade);
  }
  const imagensSrv = Array.isArray(template.imagens) ? template.imagens : [];
  const imagens = imagensSrv.filter((im) => im && typeof im.urlImagem === 'string' && im.urlImagem.startsWith('data:image/')).map((im, i) => {
    const largPx = num(im.largura, 0) || 200;
    return {
      id: 'img_tpl_' + Date.now().toString(36) + '_' + i,
      url: im.urlImagem, nome: null,
      x: ((num(im.x) + largPx / 2) / lc) * 100,
      y: (num(im.y) / ac) * 100,
      largura: (largPx / lc) * 100,
      alturaProporcao: num(im.altura) > 0 && largPx > 0 ? num(im.altura) / largPx : 1,
      opacidade: Number.isFinite(Number(im.opacidade)) ? Number(im.opacidade) : 100,
      visivel: true,
    };
  });
  return preservar({
    ...base,
    canvas: { largura: lc, altura: ac, corFundo: typeof template.corFundo === 'string' && template.corFundo ? template.corFundo : '#ffffff' },
    areaVideo: {
      ...base.areaVideo,
      x: area ? num(area.x, 0) : 0,
      y: area ? num(area.y, 0) : 0,
      largura: temArea ? num(area.largura) : lc,
      altura: temArea ? num(area.altura) : ac,
      fit: area && area.fit === 'ajustar' ? 'ajustar' : 'cobrir',
      zoom: Number(area && area.zoom) > 0 ? Number(area.zoom) : 1,
      deslocamentoX: Number.isFinite(Number(area && area.deslocamentoX)) ? Number(area.deslocamentoX) : 50,
      deslocamentoY: Number.isFinite(Number(area && area.deslocamentoY)) ? Number(area.deslocamentoY) : 50,
      mostrarMarcacao: temArea,
    },
    corteBordas: template.corteBordas && typeof template.corteBordas === 'object'
      ? { ativo: !!template.corteBordas.ativo, superior: num(template.corteBordas.superior), inferior: num(template.corteBordas.inferior) }
      : { ...base.corteBordas },
    overridesPorVideo: {},
    logo,
    textos: {
      superior: textoSrvParaCfg(template.texto, lc, ac, base.textos.superior),
      inferior: textoSrvParaCfg(template.textoInferior, lc, ac, base.textos.inferior),
    },
    identidade: {
      nome: textoSrvParaCfg(template.identidadeNome, lc, ac, base.identidade.nome),
      usuario: textoSrvParaCfg(template.identidadeUsuario, lc, ac, base.identidade.usuario),
      selo,
    },
    imagens,
  });
}


export function metaDoTemplate(template) {
  if (!template || typeof template !== 'object') return null;
  return { id: template.id, nome: template.nome || '(sem nome)', atualizadoEm: template.atualizadoEm || null };
}

